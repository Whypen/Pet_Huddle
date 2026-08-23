import { Feather } from "@expo/vector-icons";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  type KeyboardEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSpinner } from "../components/NativeSpinner";
import {
  NativePetDetailsContent,
  type NativePetDetailsData,
} from "../components/NativePetDetailsContent";
import { AppDestructiveSlideConfirm, AppKeyboardAvoidingView as KeyboardAvoidingView } from "../components/nativeModalPrimitives";
import { NativeFormChoiceField, NativeFormTextField } from "../components/NativeFormField";
import { NativePhoneField, findNativePhoneCountry } from "../components/NativePhoneField";
import { NativeHeroPhotoPicker } from "../components/NativeHeroPhotoPicker";
import { NativeCollapsibleSection } from "../components/profile/NativeCollapsibleSection";
import { NativeMediaImageCropper, type NativePresentationCrop } from "../components/profile/NativeProfilePhotoCropper";
import { loadNativeProfilePhotoForEditing, pickNativeProfilePhoto } from "../components/profile/NativeProfilePhotoPicker";
import { NativeProfileProgressTrack } from "../components/profile/NativeProfileProgressTrack";
import { cleanupNativeProfilePhotoTemporaryAsset, type NativeProfileUploadAsset } from "../lib/nativeProfilePhotos";
import { useGuidedSections } from "../components/profile/useGuidedSections";
import { haptic } from "../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { allowValidatedWrite } from "../lib/nativeAsyncRace";
import { nativePetEmojiForLabel } from "../lib/nativePetTaxonomy";
import { useErrorShake } from "../components/motion/useErrorShake";
import {
  fetchNativeProfileSummary,
  clearNativeProfileSummaryCache,
  type NativeProfileSummary,
} from "../lib/nativeProfileSummary";
import { invalidateNativePublicProfileCaches } from "../lib/nativePublicProfile";
import { freshnessRegistry } from "../lib/nativeFreshnessRegistry";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../lib/nativeImageFreshness";
import { publishNativePetMutation } from "../lib/nativeMutationTruth";
import { fetchNativeFamilyPetContext, removeNativeFamilySharedPet, type NativeFamilyPetContext } from "../lib/nativeFamilyPets";
import { invalidateCachedSignedStorageUrl, parseNativePetImageStorageRef, resolveNativePetImageUrlAsync } from "../lib/nativeStorageUrlCache";
import { clearNativeHomePetsCache } from "./NativeHomeScreen";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { isCurrentNativeSessionKey, nativeSafeWriteErrorMessage, requireCurrentNativeSession } from "../lib/nativeSessionGuard";
import { readNativeLocalMediaFile, uploadNativeLocalMediaToSupabase, type NativeLocalMediaMeta } from "../lib/nativeLocalMediaUpload";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { huddleModalTokens } from "../components/nativeModalPrimitives.styles";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleGlassControls,
  huddleFormFields,
  huddleFormControls,
  huddleLayout,
  huddlePetPhoto,
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
  petSize: string;
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
  shareWithFamily: boolean;
};

const PET_FORM_SELECT = [
  "id",
  "owner_id",
  "name",
  "species",
  "breed",
  "pet_size",
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
  "photo_presentation",
  "is_active",
  "is_public",
  "share_with_family",
  "updated_at",
].join(", ");

type NativeSetPetScreenProps = {
  accessToken?: string | null;
  onNavigate: (path: string, options?: { refreshOnboarding?: boolean }) => void;
  onGoBack?: () => void;
  onboardingMode?: boolean;
  petId?: string | null;
  sessionKey?: string | null;
  userId: string | null;
};

const PET_REQUIRED_MESSAGES = {
  name: "Don't skip this one!",
  species: "We'll need this part.",
  customSpecies: "Gotta have this!",
  petSize: "Choose your dog's size.",
} as const;
const PET_ERROR_SCROLL_ORDER: Array<keyof PetFormData | "visit" | "reminder" | "medication"> = [
  "name",
  "species",
  "customSpecies",
  "petSize",
  "dob",
  "weight",
  "visit",
  "reminder",
  "medication",
];
const PET_ERROR_FIELD_TARGETS: Partial<Record<keyof PetFormData | "visit" | "reminder" | "medication", string>> = {
  customSpecies: "customSpecies",
  dob: "dob",
  medication: "medicationName",
  name: "name",
  petSize: "petSize",
  reminder: "reminderDate",
  species: "species",
  visit: "visitDate",
  weight: "weight",
};

const petRestHeaders = (accessToken: string, extra?: Record<string, string>) =>
  createNativeAuthenticatedHeaders(accessToken, extra);

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
    return nativeSafeErrorCopy((parsed as { message?: unknown }).message, fallback);
  }
  return nativeSafeErrorCopy(parsed, fallback);
};

const petUserFacingErrorMessage = (error: unknown, fallback: string) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.toLowerCase();
  if (normalized.includes("pets_weight_lt_100")) return "Oops...This input seems invalid.";
  if (nativeSafeWriteErrorMessage(error, "") || normalized.includes("native_session_")) {
    return "We couldn't save this pet profile. Please sign in again and retry.";
  }
  return fallback;
};

const petRestUrl = (table: string) => new URL(`${supabaseUrl}/rest/v1/${table}`);

const fetchPetRowWithToken = async (petId: string, accessToken: string) => {
  const url = petRestUrl("pets");
  url.searchParams.set("select", PET_FORM_SELECT);
  url.searchParams.set("id", `eq.${petId}`);
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

type PetPhotoStorageBucket = "pets" | "private_pet_photos";
type PetPhotoStorageObject = { bucket: PetPhotoStorageBucket; path: string };

const extractPetStorageObject = (value: string | null | undefined): PetPhotoStorageObject | null => {
  const ref = parseNativePetImageStorageRef(value);
  return ref?.kind === "storage" ? { bucket: ref.bucket, path: ref.objectPath } : null;
};

const petPhotoReference = (bucket: PetPhotoStorageBucket, path: string) => (
  bucket === "private_pet_photos"
    ? `${bucket}/${path}`
    : `${supabaseUrl}/storage/v1/object/public/pets/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`
);

const copyPetPhotoWithToken = async (source: PetPhotoStorageObject, destinationBucket: PetPhotoStorageBucket, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/copy`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({
      bucketId: source.bucket,
      sourceKey: source.path,
      destinationBucket,
      destinationKey: source.path,
    }),
  });
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || `pet_photo_copy_failed_${response.status}`);
};

const makePetPhotoObjectPath = (userId: string, petId: string, variant: "portrait", extension: string) => {
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${petId}/${variant}-${uploadId}.${extension}`;
};

const registerPetMediaAssetWithToken = async (petId: string, bucket: PetPhotoStorageBucket, objectPath: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/register_native_media_asset`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({
      p_bucket: bucket,
      p_content_id: petId,
      p_content_type: "pet_photo",
      p_expires_at: null,
      p_object_path: objectPath,
    }),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
};

const registerFamilyPetMediaAssetWithToken = async (petId: string, bucket: PetPhotoStorageBucket, objectPath: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/register_native_family_pet_media_asset`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({ p_bucket: bucket, p_object_path: objectPath, p_pet_id: petId }),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
};

const requestFamilyPetStorageCleanup = async (petId: string, bucket: PetPhotoStorageBucket, objectPath: string, reason: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/request_native_family_pet_storage_cleanup`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({ p_bucket: bucket, p_object_path: objectPath, p_reason: reason, p_pet_id: petId }),
  });
  return response.ok;
};

type DateTarget = "dob" | "visitDate" | "reminderDate";
type SelectTarget = "species" | "breed" | "petSize" | "temperament" | "visitReason" | "vaccine" | "reminderReason" | "doseUnit" | "frequencyUnit";
const petSizeOptions = ["Small", "Medium", "Large", "Giant"] as const;
const petAccordionSectionTitles = ["Basics", "About", "Vet & Health"] as const;
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
  petSize: "",
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
  shareWithFamily: false,
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

const pad2 = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const isoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
const isIsoDate = (value: string) => {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  return isoFromParts(year, month, day) === text;
};

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

const toPetPayload = (form: PetFormData, photoUrl: string | null, homeCrop: NativePresentationCrop | null) => ({
	  name: form.name,
	  species: form.species === "others" ? form.customSpecies : form.species,
	  breed: form.breed || null,
	  pet_size: form.species === "dog" ? form.petSize || null : null,
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
  share_with_family: form.shareWithFamily,
  photo_url: photoUrl,
  photo_presentation: homeCrop ? { home: homeCrop } : {},
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
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function GenderChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.genderChip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
    >
      <Text numberOfLines={1} style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function InlineToggle({ checked, disabled = false, onPress }: { checked: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={[styles.webToggleTrack, checked ? styles.webToggleTrackChecked : null, disabled ? styles.disabled : null]}>
      <View style={[styles.webToggleThumb, checked ? styles.webToggleThumbChecked : null]} />
    </Pressable>
  );
}

function InlineSelectMenu({
  borderless,
  getOptionIcon,
  options,
  onSelect,
  selectedValues,
  visible,
}: {
  borderless?: boolean;
  getOptionIcon?: (option: string) => string | null;
  options: string[];
  onSelect: (value: string) => void;
  selectedValues?: string[];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={[styles.inlinePopover, borderless ? styles.inlinePopoverBorderless : null]}>
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.inlinePopoverScroll}>
        <View style={styles.inlineOptions}>
          {options.map((option) => {
            const icon = getOptionIcon?.(option);
            const selected = selectedValues?.includes(option) ?? false;
            return (
              <Pressable
                key={option}
                onPress={() => onSelect(option)}
                style={({ pressed }) => [styles.optionRow, selected ? styles.optionRowSelected : null, pressed ? styles.pressed : null]}
              >
                <View style={styles.optionLabelRow}>
                  {icon ? <Text style={styles.optionEmoji}>{icon}</Text> : null}
                  <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option}</Text>
                </View>
                {selected ? <Feather color={huddleColors.blue} name="check" size={14} /> : <View style={styles.optionCheckSpacer} />}
              </Pressable>
            );
          })}
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
  onFocus,
  onToggle,
  value,
}: {
  error?: boolean;
  focused?: boolean;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onToggle: () => void;
  value: string;
}) {
  return (
    <View style={[styles.dateField, error ? styles.inputError : null, focused ? styles.fieldFocusedOutline : null]}>
      <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={huddleColors.mutedText}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
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
  sessionKey,
  userId,
}: NativeSetPetScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(Boolean(petId));
  const [form, setForm] = useState<PetFormData>(emptyForm);
  const [profileMode, setProfileMode] = useState<"edit" | "view">("edit");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [homeCrop, setHomeCrop] = useState<NativePresentationCrop | null>(null);
  const [petCropAsset, setPetCropAsset] = useState<(NativeProfileUploadAsset & { width?: number | null; height?: number | null }) | null>(null);
  const [editingExistingPetPhoto, setEditingExistingPetPhoto] = useState(false);
  const [photoAssetMeta, setPhotoAssetMeta] = useState<NativeLocalMediaMeta | null>(null);
  const [petPhotoUpdatedAt, setPetPhotoUpdatedAt] = useState<string | null>(null);
  const [savedPetId, setSavedPetId] = useState<string | null>(petId);
  const [isNewPet, setIsNewPet] = useState(onboardingMode || !petId);
  const [petOwnerId, setPetOwnerId] = useState<string | null>(userId);
  const [familyPetContext, setFamilyPetContext] = useState<NativeFamilyPetContext | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setMessage("Pet details are taking too long to load. Please try again.");
    },
  });

  const [removePetConfirmOpen, setRemovePetConfirmOpen] = useState(false);
  const { shake: triggerSaveShake, shakeStyle: saveShakeStyle } = useErrorShake();
  const [errors, setErrors] = useState<Partial<Record<keyof PetFormData | "visit" | "reminder" | "medication", string>>>({});
  const [selectTarget, setSelectTarget] = useState<SelectTarget | null>(null);
  const [dateTarget, setDateTarget] = useState<DateTarget | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const editScrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const nextAutoExpandScrollYRef = useRef(huddleSpacing.x8);
  const scrollViewportHeightRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const preferredVetInputRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);
  // Every section is a collapsible card with guided flow (all modes): opens the
  // first incomplete section and auto-follows forward as sections complete;
  // stops the moment the user opens a section themselves. See useGuidedSections.
  const petAccordion = true;
  const [autoExpandedPetSections, setAutoExpandedPetSections] = useState<Set<string>>(() => new Set());
  const isPetSectionComplete = (title: string): boolean => {
    switch (title) {
      case "Basics":
        return Boolean(form.name.trim() && form.species && (form.species !== "others" || form.customSpecies.trim()));
      case "About":
        return Boolean(form.bio.trim() || form.temperament.length > 0 || form.routine.trim());
      default:
        return false; // Vet & Health is last.
    }
  };
  const { openSection: openPetSection, toggleSection: togglePetSection, openSectionManually: openPetSectionManually, progress: petProgress } = useGuidedSections(
    [...petAccordionSectionTitles],
    isPetSectionComplete,
  );
  const isPetSectionOpen = (title: string) => !petAccordion || openPetSection === title || autoExpandedPetSections.has(title);
  const togglePetProfileSection = (title: string) => {
    if (!autoExpandedPetSections.has(title)) {
      togglePetSection(title);
      return;
    }
    setAutoExpandedPetSections((current) => {
      const next = new Set(current);
      next.delete(title);
      return next;
    });
    if (openPetSection === title) togglePetSection(title);
  };
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
  const sessionKeyRef = useRef<string | null>(sessionKey ?? null);
  const persistedPetPhotoObjectPathRef = useRef<string | null>(null);
  const persistedPetPhotoBucketRef = useRef<PetPhotoStorageBucket | null>(null);

  useEffect(() => {
    sessionKeyRef.current = sessionKey ?? null;
  }, [sessionKey]);

  const requirePetSession = useCallback(() => (
    requireCurrentNativeSession({ accessToken, expectedUserId: userId, sessionKey })
  ), [accessToken, sessionKey, userId]);

  useEffect(() => {
    setForm(emptyForm);
    setPhotoUri(null);
    setHomeCrop(null);
    setPhotoAssetMeta(null);
    setPetPhotoUpdatedAt(null);
    persistedPetPhotoObjectPathRef.current = null;
    persistedPetPhotoBucketRef.current = null;
    setSavedPetId(petId);
    setIsNewPet(onboardingMode || !petId);
    setPetOwnerId(userId);
    setFamilyPetContext(null);
    setSaving(false);
    setMessage(null);
    setRemovePetConfirmOpen(false);
    setErrors({});
    setSelectTarget(null);
    setDateTarget(null);
    setFocusedField(null);
    setVisitDraft({ reason: "", customReason: "", visitDate: "", vaccine: "" });
    setVisitEditIndex(null);
    setShowVisitEditor(false);
    setReminderDraft({ reason: "", customReason: "", reminderDate: "" });
    setReminderEditIndex(null);
    setShowReminderEditor(false);
    setMedicationDraft({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
    setMedicationEditIndex(null);
    setShowMedicationEditor(false);
    setLoading(Boolean(petId));
  }, [onboardingMode, petId, sessionKey, userId]);

  const speciesForVaccines = useMemo(() => normalizeSpeciesKey(form.species === "others" ? form.customSpecies : form.species), [form.customSpecies, form.species]);
  const vaccineOptions = vaccinesBySpecies[speciesForVaccines] ?? null;
  const breedOptions = form.species !== "others" ? speciesBreeds[form.species] ?? ["Others"] : [];
  const selectedSpeciesOption = speciesOptions.find((option) => option.id === form.species) ?? null;

  const setFieldRef = useCallback(
    (fieldName: string) => (node: View | null) => {
      fieldRefs.current[fieldName] = node;
    },
    [],
  );

  const handleEditScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    scrollYRef.current = scrollY;
    if (scrollY < nextAutoExpandScrollYRef.current) return;
    nextAutoExpandScrollYRef.current = scrollY + huddleSpacing.x9;
    setAutoExpandedPetSections((current) => {
      const next = petAccordionSectionTitles.find((title) => title !== openPetSection && !current.has(title));
      return next ? new Set([...current, next]) : current;
    });
  }, [openPetSection]);

  const scrollFieldIntoView = useCallback(
    (fieldName: string, keyboardAware = false) => {
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
            const keyboardSafeInset = keyboardAware
              ? Math.min(Math.max(keyboardHeightRef.current || 300, 260), Math.round(viewportHeight * 0.5))
              : huddleSpacing.x3;
            const bottomLimit = viewportHeight - keyboardSafeInset - huddleSpacing.x4;
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

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent) => {
      keyboardHeightRef.current = Math.max(0, event.endCoordinates.height || 0);
      if (focusedField) {
        window.setTimeout(() => scrollFieldIntoView(focusedField, true), 40);
      }
    };
    const handleKeyboardHide = () => {
      keyboardHeightRef.current = 0;
    };
    const showSubscription = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", handleKeyboardHide);
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [focusedField, scrollFieldIntoView]);

  const focusField = useCallback(
    (fieldName: string) => {
      setSelectTarget(null);
      setDateTarget(null);
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName, true);
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
      updated_at: petPhotoUpdatedAt,
    };
  }, [form, petId, petPhotoUpdatedAt, photoUri, savedPetId, userId]);

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
    void fetchNativeProfileSummary(userId, { accessToken, sessionKey }).then((snapshot) => applyProfileCountry(snapshot.profile), () => {});
    return () => {
      active = false;
    };
  }, [accessToken, defaultPhoneCountryCode, sessionKey, userId]);

  const fetchPet = useCallback(async () => {
    if (!petId) {
      void fetchNativeFamilyPetContext(null, accessToken).then(setFamilyPetContext).catch(() => setFamilyPetContext(null));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const session = requirePetSession();
      const freshAccessToken = await getFreshNativeAccessToken(session.accessToken);
      if (!freshAccessToken) throw new Error("auth_required");
      const requestSessionKey = session.sessionKey;
      const [data, petContext] = await Promise.all([
        fetchPetRowWithToken(petId, freshAccessToken),
        fetchNativeFamilyPetContext(petId, freshAccessToken),
      ]);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return;
      if (!data) {
        setMessage("Couldn't load this pet.");
        setLoading(false);
        return;
      }

      const row = data as unknown as Record<string, unknown>;
      setPetOwnerId(typeof row.owner_id === "string" ? row.owner_id : session.userId);
      setFamilyPetContext(petContext);

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
        petSize: species === "dog" && petSizeOptions.includes(String(row.pet_size || "") as typeof petSizeOptions[number]) ? String(row.pet_size) : "",
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
        shareWithFamily: row.share_with_family === true,
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
      const persistedPhotoUrl = typeof row.photo_url === "string" ? row.photo_url : null;
      const resolvedPersistedPhotoUrl = persistedPhotoUrl
        ? await resolveNativePetImageUrlAsync(persistedPhotoUrl).catch(() => null)
        : null;
      setPhotoUri(resolvedPersistedPhotoUrl);
      const presentation = row.photo_presentation && typeof row.photo_presentation === "object" && !Array.isArray(row.photo_presentation)
        ? row.photo_presentation as { home?: Partial<NativePresentationCrop> }
        : null;
      const nextHomeCrop = presentation?.home;
      setHomeCrop(typeof nextHomeCrop?.centerX === "number" && typeof nextHomeCrop?.centerY === "number"
        ? { centerX: nextHomeCrop.centerX, centerY: nextHomeCrop.centerY, widthPct: typeof nextHomeCrop.widthPct === "number" ? nextHomeCrop.widthPct : 100 }
        : null);
      setPetPhotoUpdatedAt(typeof row.updated_at === "string" ? row.updated_at : null);
      const persistedPhotoObject = extractPetStorageObject(persistedPhotoUrl);
      persistedPetPhotoObjectPathRef.current = persistedPhotoObject?.path ?? null;
      persistedPetPhotoBucketRef.current = persistedPhotoObject?.bucket ?? null;
      setPhotoAssetMeta(null);
      setSavedPetId(petId);
      setIsNewPet(false);
    } catch {
      setMessage("Couldn't load this pet.");
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, sessionKey)) setLoading(false);
    }
  }, [accessToken, petId, requirePetSession, sessionKey]);

  useEffect(() => {
    void fetchPet();
  }, [fetchPet]);

  const pickPhoto = async () => {
    try {
      // Use the same picker as profile/signup — it presents PHPicker regardless of
      // permission state (no hard block on "Limited Access"/denied) — then hand off
      // to the banner-first cropper.
      const picked = await pickNativeProfilePhoto({});
      const asset = picked?.asset;
      if (!asset?.uri) return;
      setEditingExistingPetPhoto(false);
      setPetCropAsset({
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        mimeType: asset.mimeType ?? null,
        fileSize: typeof asset.fileSize === "number" ? asset.fileSize : null,
        width: typeof asset.width === "number" ? asset.width : null,
        height: typeof asset.height === "number" ? asset.height : null,
      });
    } catch (error) {
      setMessage(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
    }
  };

  const editCurrentPhoto = async () => {
    if (!photoUri) {
      await pickPhoto();
      return;
    }
    try {
      setEditingExistingPetPhoto(true);
      setPetCropAsset(await loadNativeProfilePhotoForEditing(photoUri));
    } catch (error) {
      setMessage(nativeSafeErrorCopy(error, "Couldn't prepare that photo for editing. Try choosing it again."));
    }
  };

  const removePhoto = () => {
    setPhotoUri(null);
    setHomeCrop(null);
    setPhotoAssetMeta(null);
    setPetPhotoUpdatedAt(null);
    setPetCropAsset(null);
    setEditingExistingPetPhoto(false);
  };

  const handlePetPhotoCropped = async (cropped: NativeProfileUploadAsset, _aspect: unknown, presentationCrop?: NativePresentationCrop) => {
    if (editingExistingPetPhoto) {
      setHomeCrop(presentationCrop ?? null);
      setPetCropAsset(null);
      setEditingExistingPetPhoto(false);
      return;
    }
    const uri = cropped.uri || "";
    if (!uri) {
      setPetCropAsset(null);
      return;
    }
    setPhotoUri(uri);
    setHomeCrop(presentationCrop ?? null);
    setPetPhotoUpdatedAt(`${uri}:${Date.now()}`);
    setPhotoAssetMeta({ fileName: cropped.fileName ?? null, mimeType: cropped.mimeType ?? null });
    setPetCropAsset(null);
  };

  const validateBaseForm = (draftOnly: boolean) => {
    const nextErrors: Partial<Record<keyof PetFormData | "visit" | "reminder" | "medication", string>> = {};
    if (!draftOnly) {
      if (!form.name.trim()) nextErrors.name = PET_REQUIRED_MESSAGES.name;
      if (!form.species && !form.customSpecies.trim()) nextErrors.species = PET_REQUIRED_MESSAGES.species;
      if (form.species === "others" && !form.customSpecies.trim()) nextErrors.customSpecies = PET_REQUIRED_MESSAGES.customSpecies;
      if (form.species === "dog" && !form.petSize) nextErrors.petSize = PET_REQUIRED_MESSAGES.petSize;
    }
    if (form.dob) {
      if (!isIsoDate(form.dob)) {
        nextErrors.dob = "Use a valid calendar date.";
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
    const firstErrorKey = PET_ERROR_SCROLL_ORDER.find((key) => Boolean(nextErrors[key]));
    return {
      firstErrorField: firstErrorKey ? PET_ERROR_FIELD_TARGETS[firstErrorKey] || String(firstErrorKey) : null,
      valid: !firstErrorKey,
    };
  };

  const validateBeforePetWrite = (draftOnly: boolean) => {
    const validation = validateBaseForm(draftOnly);
    return allowValidatedWrite(validation, () => {
      triggerSaveShake();
      if (!validation.firstErrorField) return;
      const field = validation.firstErrorField;
      openPetSectionManually(field === "medicationName" || field === "visitDate" || field === "reminderDate" ? "Vet & Health" : "Basics");
      setFocusedField(field);
      scrollFieldIntoView(field);
    });
  };

  const uploadPetPhotoAsset = async (petId: string, activeUserId: string, activeAccessToken: string, uri: string, meta: NativeLocalMediaMeta | null, variant: "portrait") => {
    try {
      const bucket: PetPhotoStorageBucket = form.isPublic ? "pets" : "private_pet_photos";
      const file = await readNativeLocalMediaFile(uri, meta, { fallbackContentType: "image/jpeg", fallbackExtension: "jpg" });
      const fileName = makePetPhotoObjectPath(activeUserId, petId, variant, file.extension);
      await uploadNativeLocalMediaToSupabase({
        accessToken: activeAccessToken,
        body: file.body,
        bucket,
        contentType: file.contentType,
        path: fileName,
        upsert: true,
      });
      try {
        if (familyPetContext?.is_family_shared) {
          await registerFamilyPetMediaAssetWithToken(petId, bucket, fileName, activeAccessToken);
        } else {
          await registerPetMediaAssetWithToken(petId, bucket, fileName, activeAccessToken);
        }
      } catch (registrationError) {
        const cleanupResult = familyPetContext?.is_family_shared
          ? await requestFamilyPetStorageCleanup(petId, bucket, fileName, "register_pet_photo_media_failed", activeAccessToken).then((queued) => queued ? "queued" as const : "failed" as const)
          : await requestNativeStorageCleanupResult(bucket, fileName, "register_pet_photo_media_failed", activeAccessToken);
        throw createNativeProtectedActionError({
          ok: false,
          stage: "register",
          originalError: registrationError,
          cleanupAttempted: true,
          cleanupResult,
        });
      }
      if (__DEV__) {
        console.log("STORAGE_URL_PET_REFERENCE", { bucket, path: fileName });
      }
      return {
        bucket,
        objectPath: fileName,
        url: petPhotoReference(bucket, fileName),
      };
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
  };

  const uploadPhoto = async (petId: string, activeUserId: string, activeAccessToken: string): Promise<{
    bucket: PetPhotoStorageBucket | null;
    portraitObjectPath: string | null;
    portraitUrl: string | null;
  }> => {
    if (!photoUri) return { bucket: null, portraitObjectPath: null, portraitUrl: null };
    if (photoUri.startsWith("http")) {
      return {
        bucket: null,
        portraitObjectPath: null,
        portraitUrl: photoUri,
      };
    }
    const portrait = await uploadPetPhotoAsset(petId, activeUserId, activeAccessToken, photoUri, photoAssetMeta, "portrait");
    return { bucket: portrait.bucket, portraitObjectPath: portrait.objectPath, portraitUrl: portrait.url };
  };

  const cleanupPetPhotoObject = async (petId: string, object: PetPhotoStorageObject, reason: string, activeAccessToken: string) => (
    familyPetContext?.is_family_shared
      ? requestFamilyPetStorageCleanup(petId, object.bucket, object.path, reason, activeAccessToken).then((queued) => queued ? "queued" as const : "failed" as const)
      : requestNativeStorageCleanupResult(object.bucket, object.path, reason, activeAccessToken)
  );

  const savePet = async (draftOnly: boolean) => {
    let session: ReturnType<typeof requireCurrentNativeSession>;
    try {
      session = requirePetSession();
    } catch {
      setMessage("Please sign in again to save your pet profile.");
      return;
    }
    if (!validateBeforePetWrite(draftOnly)) return;
    setSaving(true);
    setMessage(null);
    let uploadedPetPhotoObjects: PetPhotoStorageObject[] = [];
    const targetPetId = savedPetId || petId || makeUuid();
    let cleanupAccessToken = session.accessToken;
    try {
      const freshAccessToken = await getFreshNativeAccessToken(session.accessToken);
      if (!freshAccessToken) throw new Error("auth_required");
      cleanupAccessToken = freshAccessToken;
      const targetOwnerId = isNewPet ? session.userId : petOwnerId || session.userId;
      const previousPetPhotoPath = persistedPetPhotoObjectPathRef.current;
      const previousPetPhotoBucket = persistedPetPhotoBucketRef.current;
      const previousPetPhotoObject = previousPetPhotoPath && previousPetPhotoBucket
        ? { bucket: previousPetPhotoBucket, path: previousPetPhotoPath } satisfies PetPhotoStorageObject
        : null;
      const desiredPetPhotoBucket: PetPhotoStorageBucket = form.isPublic ? "pets" : "private_pet_photos";
      let photoUpload = await uploadPhoto(targetPetId, targetOwnerId, freshAccessToken);
      if (!photoUpload.portraitObjectPath && previousPetPhotoObject && photoUri) {
        if (previousPetPhotoObject.bucket !== desiredPetPhotoBucket) {
          await copyPetPhotoWithToken(previousPetPhotoObject, desiredPetPhotoBucket, freshAccessToken);
          uploadedPetPhotoObjects = [{ bucket: desiredPetPhotoBucket, path: previousPetPhotoObject.path }];
          if (familyPetContext?.is_family_shared) {
            await registerFamilyPetMediaAssetWithToken(targetPetId, desiredPetPhotoBucket, previousPetPhotoObject.path, freshAccessToken);
          } else {
            await registerPetMediaAssetWithToken(targetPetId, desiredPetPhotoBucket, previousPetPhotoObject.path, freshAccessToken);
          }
        }
        photoUpload = {
          bucket: desiredPetPhotoBucket,
          portraitObjectPath: previousPetPhotoObject.path,
          portraitUrl: petPhotoReference(desiredPetPhotoBucket, previousPetPhotoObject.path),
        };
      } else if (photoUpload.bucket && photoUpload.portraitObjectPath) {
        uploadedPetPhotoObjects = [{ bucket: photoUpload.bucket, path: photoUpload.portraitObjectPath }];
      }
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) {
        await Promise.allSettled(uploadedPetPhotoObjects.map((object) => cleanupPetPhotoObject(targetPetId, object, "stale_pet_photo_upload", freshAccessToken)));
        return;
      }
      const photoUrl = photoUpload.portraitUrl;
      const payload = toPetPayload(form, photoUrl, homeCrop);
      const savedUpdatedAt = typeof payload.updated_at === "string" ? payload.updated_at : new Date().toISOString();
      await savePetRowWithToken(targetPetId, session.userId, {
        ...payload,
        ...(isNewPet ? { name: payload.name || "", species: payload.species || "", created_at: new Date().toISOString() } : {}),
      }, isNewPet, freshAccessToken);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) return;
      setSavedPetId(targetPetId);
      setIsNewPet(false);
      setPetPhotoUpdatedAt(savedUpdatedAt);
      if (photoUrl) {
        setPhotoUri(await resolveNativePetImageUrlAsync(photoUrl).catch(() => photoUrl));
        const savedPhotoObject = photoUpload.bucket && photoUpload.portraitObjectPath
          ? { bucket: photoUpload.bucket, path: photoUpload.portraitObjectPath }
          : extractPetStorageObject(photoUrl);
        persistedPetPhotoObjectPathRef.current = savedPhotoObject?.path ?? null;
        persistedPetPhotoBucketRef.current = savedPhotoObject?.bucket ?? null;
      } else {
        setPhotoUri(null);
        persistedPetPhotoObjectPathRef.current = null;
        persistedPetPhotoBucketRef.current = null;
      }
      publishNativePetMutation({
        petId: targetPetId,
        sessionKey: session.sessionKey,
        userId: session.userId,
        pet: {
          ...payload,
          id: targetPetId,
          is_active: payload.is_active ?? true,
          photo_url: photoUrl ?? payload.photo_url ?? photoUri ?? null,
          photo_presentation: payload.photo_presentation,
          updated_at: savedUpdatedAt,
        },
      });
      if (photoUpload.bucket && photoUpload.portraitObjectPath) {
        invalidateCachedSignedStorageUrl(photoUpload.bucket, photoUpload.portraitObjectPath);
      }
      await Promise.allSettled([
        clearNativeHomePetsCache(session.userId),
        clearNativeProfileSummaryCache(session.userId),
        invalidateNativePublicProfileCaches({ petId: targetPetId, userId: session.userId }),
      ]);
      freshnessRegistry.invalidate(session.sessionKey, ["active_pets", "profile_summary", "public_profile", "pet_detail"]);
      const nextPetPhotoObject = photoUpload.bucket && photoUpload.portraitObjectPath
        ? { bucket: photoUpload.bucket, path: photoUpload.portraitObjectPath } satisfies PetPhotoStorageObject
        : extractPetStorageObject(photoUrl);
      const replacedObjects = previousPetPhotoObject && (
        !nextPetPhotoObject
        || previousPetPhotoObject.bucket !== nextPetPhotoObject.bucket
        || previousPetPhotoObject.path !== nextPetPhotoObject.path
      ) ? [previousPetPhotoObject] : [];
      await Promise.allSettled(replacedObjects.map(async (object) => {
        const cleanupReason = nextPetPhotoObject ? "replace_pet_photo" : "remove_pet_photo";
        const cleanupResult = familyPetContext?.is_family_shared
          ? await requestFamilyPetStorageCleanup(targetPetId, object.bucket, object.path, cleanupReason, freshAccessToken).then((queued) => queued ? "queued" as const : "failed" as const)
          : await requestNativeStorageCleanupResult(object.bucket, object.path, cleanupReason, freshAccessToken);
        if (cleanupResult === "failed") {
          logNativeProtectedActionFailure("[native.pet] pet_photo_cleanup_failed", createNativeProtectedActionError({
            ok: false,
            stage: "cleanup",
            originalError: new Error("pet_photo_cleanup_failed"),
            cleanupAttempted: true,
            cleanupResult,
          }));
        }
      }));
      if (draftOnly) {
        haptic.success();
        setMessage("Draft saved");
        return;
      }

      if (!onboardingMode) {
        haptic.success();
        onNavigate(`/pet-details?id=${targetPetId}`);
        return;
      }

      haptic.success();
      Alert.alert(
        "Welcome to huddle!",
        "Pet care tracking, nearby connections, and all pet community happenings – right in your palm now!",
        [{ text: "Continue", onPress: () => onNavigate("/", { refreshOnboarding: true }) }],
      );
    } catch (error) {
      let failure = getNativeProtectedActionResult(error);
      if (!failure) {
        const cleanupResults = await Promise.all(uploadedPetPhotoObjects.map((object) => cleanupPetPhotoObject(targetPetId, object, "pet_photo_save_failed", cleanupAccessToken)));
        const cleanupResult = cleanupResults.includes("failed")
          ? "failed"
          : cleanupResults.includes("queued")
            ? "queued"
            : uploadedPetPhotoObjects.length
              ? "deleted"
              : "not_needed";
        failure = {
          ok: false,
          stage: "domain_save",
          originalError: error,
          cleanupAttempted: uploadedPetPhotoObjects.length > 0,
          cleanupResult,
        };
      }
      logNativeProtectedActionFailure("[native.pet] save_failed", error instanceof Error && getNativeProtectedActionResult(error) ? error : createNativeProtectedActionError(failure));
      haptic.error();
      setMessage(petUserFacingErrorMessage(failure.originalError, "Couldn't save this pet's profile. Please try again."));
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) setSaving(false);
    }
  };

  const confirmRemovePet = () => {
    if (onboardingMode || !savedPetId || isNewPet) return;
    setRemovePetConfirmOpen(true);
  };

  const removeSharedPet = async () => {
    if (!savedPetId || !familyPetContext?.is_family_shared || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await removeNativeFamilySharedPet(savedPetId, accessToken);
      if (userId) await clearNativeHomePetsCache(userId);
      haptic.success();
      onNavigate("/");
    } catch (error) {
      haptic.error();
      setMessage(nativeSafeErrorCopy(error, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const removePet = async () => {
    if (onboardingMode || !savedPetId || isNewPet) return;
    let session: ReturnType<typeof requireCurrentNativeSession>;
    try {
      session = requirePetSession();
    } catch {
      setRemovePetConfirmOpen(false);
      setMessage("Please sign in again to update your pet profile.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const freshAccessToken = await getFreshNativeAccessToken(session.accessToken);
      if (!freshAccessToken) throw new Error("auth_required");
      const petPhotoObject = persistedPetPhotoBucketRef.current && persistedPetPhotoObjectPathRef.current
        ? { bucket: persistedPetPhotoBucketRef.current, path: persistedPetPhotoObjectPathRef.current } satisfies PetPhotoStorageObject
        : extractPetStorageObject(photoUri);
      await deletePetRowWithToken(savedPetId, session.userId, freshAccessToken);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) return;
      if (petPhotoObject) {
        await requestNativeStorageCleanupResult(petPhotoObject.bucket, petPhotoObject.path, "delete_pet_photo", freshAccessToken);
      }
      publishNativePetMutation({ deleted: true, petId: savedPetId, sessionKey: session.sessionKey, userId: session.userId });
      await Promise.allSettled([
        clearNativeHomePetsCache(session.userId),
        clearNativeProfileSummaryCache(session.userId),
        invalidateNativePublicProfileCaches({ petId: savedPetId, userId: session.userId }),
      ]);
      freshnessRegistry.invalidate(session.sessionKey, ["active_pets", "profile_summary", "public_profile", "pet_detail"]);
      haptic.success();
      setRemovePetConfirmOpen(false);
      onNavigate("/");
    } catch (error) {
      haptic.error();
      setMessage(nativeSafeErrorCopy(error, "Couldn't remove this pet."));
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) setSaving(false);
    }
  };

  const silentSave = async () => {
    if (!savedPetId || isNewPet) return true;
    if (!validateBeforePetWrite(false)) return false;
    try {
      const session = requirePetSession();
      const freshAccessToken = await getFreshNativeAccessToken(session.accessToken);
      if (!freshAccessToken) throw new Error("auth_required");
      const { photo_url: _photoUrl, ...payload } = toPetPayload(form, null, homeCrop);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) return false;
      await savePetRowWithToken(savedPetId, session.userId, payload, false, freshAccessToken);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, session.sessionKey)) return false;
      return true;
    } catch (err) {
      logNativeProtectedActionFailure("[NativeSetPetScreen.silentSave]", err);
      return false;
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
	    if (selectTarget === "petSize") updateForm({ petSize: value });
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
        <NativeLoadingState variant="centered" />
      </View>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => {
              if (onboardingMode) {
                onNavigate("/edit-profile");
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
            {saving ? <NativeSpinner tone="secondary" /> : <Feather color={huddleColors.text} name="save" size={20} />}
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
              void silentSave().then((saved) => {
                if (saved) setProfileMode("view");
              });
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
            // View mode renders NativePetDetailsContent, whose sections already space
            // themselves via card marginTop; drop the form gap so it matches /pet-details.
            profileMode === "view" ? styles.petViewContent : null,
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
          <NativeProfileProgressTrack progress={petProgress} />
          <View style={styles.photoWrap}>
            <NativeHeroPhotoPicker
              uri={photoUri}
              version={photoUri ? nativeMutableImageVersion(photoUri, petPhotoUpdatedAt) : null}
              onPick={pickPhoto}
              onEdit={() => void editCurrentPhoto()}
              onRemove={removePhoto}
              badgeLabel="Pet Photo"
              emptyTitle="Add a pet photo"
              emptyHelper="A clear, well-lit photo of your pet."
            />
          </View>

          <NativeCollapsibleSection
            title="Basics"
            bodyStyle={styles.sectionBody}
            collapsible={petAccordion}
            open={isPetSectionOpen("Basics")}
            onToggle={() => togglePetProfileSection("Basics")}
          >
          <View style={styles.identityFieldGroup}>
          <View ref={setFieldRef("name")} style={styles.section}>
            <FieldLabel>Pet Name</FieldLabel>
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
              onChangeText={(name) => updateForm({ name })}
              onBlur={() => {
                setFocusedField(null);
                setErrors((current) => ({ ...current, name: form.name.trim() ? "" : "Pet name is required" }));
              }}
              onFocus={() => focusField("name")}
              placeholder="Pet's name"
              placeholderTextColor={huddleColors.mutedText}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              style={[styles.input, focusedField === "name" ? styles.inputFocused : null, errors.name ? styles.inputError : null]}
              value={form.name}
            />
            {errors.name ? <ErrorText>{errors.name}</ErrorText> : null}
          </View>

          <View ref={setFieldRef("species")} style={styles.section}>
            <NativeFormChoiceField error={errors.species} focused={selectTarget === "species" || focusedField === "species"} label="">
              <Pressable
                accessibilityRole="button"
                onPress={() => toggleSelectField("species")}
                style={styles.petTypeSelectTrigger}
              >
                <View style={styles.petTypeSelectValueRow}>
                  {selectedSpeciesOption ? <Text style={styles.petTypeEmoji}>{nativePetEmojiForLabel(selectedSpeciesOption.label)}</Text> : null}
                  <Text numberOfLines={1} style={[styles.petTypeSelectValue, !selectedSpeciesOption ? styles.placeholder : null]}>
                    {selectedSpeciesOption?.label || "Species"}
                  </Text>
                </View>
                <Feather color={huddleColors.mutedText} name={selectTarget === "species" ? "chevron-up" : "chevron-down"} size={18} />
              </Pressable>
              <InlineSelectMenu
                borderless
                getOptionIcon={nativePetEmojiForLabel}
                onSelect={(value) => {
                  const nextSpecies = speciesOptions.find((option) => option.label === value);
                  if (!nextSpecies) return;
                  updateForm({
                    species: nextSpecies.id,
                    breed: "",
                    petSize: nextSpecies.id === "dog" ? form.petSize : "",
                  });
                  setErrors((current) => ({
                    ...current,
                    species: "",
                    customSpecies: nextSpecies.id === "others" ? current.customSpecies : "",
                  }));
                  setSelectTarget(null);
                }}
                options={speciesOptions.map((option) => option.label)}
                selectedValues={selectedSpeciesOption ? [selectedSpeciesOption.label] : []}
                visible={selectTarget === "species"}
              />
            </NativeFormChoiceField>
            {form.species === "others" ? (
              <View ref={setFieldRef("customSpecies")} style={styles.fieldStack}>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  onChangeText={(customSpecies) => updateForm({ customSpecies })}
                  onBlur={() => {
                    setFocusedField(null);
                    setErrors((current) => ({ ...current, customSpecies: form.customSpecies.trim() ? "" : "Species is required" }));
                  }}
                  onFocus={() => focusField("customSpecies")}
                  placeholder="Enter species..."
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  style={[styles.input, focusedField === "customSpecies" ? styles.inputFocused : null, errors.customSpecies ? styles.inputError : null]}
                  value={form.customSpecies}
                />
                {errors.customSpecies ? <ErrorText>{errors.customSpecies}</ErrorText> : null}
              </View>
            ) : null}
          </View>

          {form.species !== "others" ? (
            <View ref={setFieldRef("breed")} style={styles.section}>
              <Pressable onPress={() => toggleSelectField("breed")} style={[styles.selectField, selectTarget === "breed" || focusedField === "breed" ? styles.fieldFocusedOutline : null]}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.selectText, !form.breed ? styles.placeholder : null]}>{form.breed || "Breed"}</Text>
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
          {form.species === "dog" ? (
            <View ref={setFieldRef("petSize")} style={[styles.section, styles.petSizeField]}>
              <FieldLabel>Pet Size</FieldLabel>
              <Pressable onPress={() => toggleSelectField("petSize")} style={[styles.selectField, selectTarget === "petSize" || focusedField === "petSize" ? styles.fieldFocusedOutline : null, errors.petSize ? styles.inputError : null]}>
                <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.selectText, !form.petSize ? styles.placeholder : null]}>{form.petSize || "Select size"}</Text>
                <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
              </Pressable>
              <InlineSelectMenu
                onSelect={(value) => {
                  updateForm({ petSize: value });
                  setErrors((current) => ({ ...current, petSize: "" }));
                  setSelectTarget(null);
                }}
                options={[...petSizeOptions]}
                selectedValues={form.petSize ? [form.petSize] : []}
                visible={selectTarget === "petSize"}
              />
              {errors.petSize ? <ErrorText>{errors.petSize}</ErrorText> : null}
            </View>
          ) : null}
          </View>

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

          <View style={[styles.twoColumn, styles.dateWeightRow]}>
	            <View ref={setFieldRef("dob")} style={[styles.dateOfBirthColumn, styles.fieldStack]}>
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
                        dob: !isIsoDate(dob) ? "Use a valid calendar date." : "",
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
                      dob: petDob > todayAtMidnight() ? "Pet DOB cannot be in the future" : !isIsoDate(form.dob) ? "Use a valid calendar date." : "",
                    }));
                  }}
                  onFocus={() => focusField("dob")}
                  onToggle={() => toggleDateField("dob")}
                  value={form.dob}
                />
                <InlineDatePicker onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "dob"} />
	              {errors.dob ? <ErrorText>{errors.dob}</ErrorText> : null}
            </View>
            <View ref={setFieldRef("weight")} style={[styles.weightColumn, styles.fieldStack]}>
              <NativeFormTextField
                ref={weightInputRef}
                error={errors.weight}
                fieldAccessory={(
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
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
                )}
                keyboardType="decimal-pad"
                label="Weight"
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
                onSubmitEditing={Keyboard.dismiss}
                placeholder="0"
                returnKeyType="done"
                value={form.weight}
              />
            </View>
          </View>
          </NativeCollapsibleSection>

          <NativeCollapsibleSection
            title="About"
            bodyStyle={styles.sectionBody}
            collapsible={petAccordion}
            open={isPetSectionOpen("About")}
            onToggle={() => togglePetProfileSection("About")}
          >
          <View ref={setFieldRef("bio")} style={styles.section}>
            <FieldLabel>Pet Bio</FieldLabel>
            <TextInput
              multiline
              onChangeText={(bio) => updateForm({ bio })}
              onBlur={() => setFocusedField(null)}
              onFocus={() => focusField("bio")}
              placeholder="Tell us about your pet"
              placeholderTextColor={huddleColors.mutedText}
              scrollEnabled
              style={[styles.input, styles.textArea, focusedField === "bio" ? styles.inputFocused : null]}
              value={form.bio}
            />
          </View>

          <View ref={setFieldRef("temperament")} style={styles.section}>
            <Pressable onPress={() => toggleSelectField("temperament")} style={[styles.selectField, selectTarget === "temperament" || focusedField === "temperament" ? styles.fieldFocusedOutline : null]}>
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
              scrollEnabled
              style={[styles.input, styles.textAreaSmall, focusedField === "routine" ? styles.inputFocused : null]}
              value={form.routine}
            />
          </View>
          </NativeCollapsibleSection>

          <NativeCollapsibleSection
            title="Vet & Health"
            bodyStyle={styles.sectionBody}
            collapsible={petAccordion}
            open={isPetSectionOpen("Vet & Health")}
            onToggle={() => togglePetProfileSection("Vet & Health")}
          >
          <View ref={setFieldRef("microchipId")} style={styles.section}>
            <FieldLabel>Microchip ID</FieldLabel>
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
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
            <FieldLabel>Vet Contact</FieldLabel>
            <View style={styles.compactFieldGroup}>
              <View ref={setFieldRef("clinicName")}>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(clinicName) => updateForm({ clinicName })} onFocus={() => focusField("clinicName")} onSubmitEditing={() => preferredVetInputRef.current?.focus()} placeholder="Clinic name" placeholderTextColor={huddleColors.mutedText} returnKeyType="next" style={[styles.input, focusedField === "clinicName" ? styles.inputFocused : null]} value={form.clinicName} />
              </View>
              <View ref={setFieldRef("preferredVet")}>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" ref={preferredVetInputRef} onBlur={() => setFocusedField(null)} onChangeText={(preferredVet) => updateForm({ preferredVet })} onFocus={() => focusField("preferredVet")} placeholder="Preferred vet" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[styles.input, focusedField === "preferredVet" ? styles.inputFocused : null]} value={form.preferredVet} />
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
          </View>

          <View style={styles.section}>
            <FieldLabel>Health Record</FieldLabel>
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
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listTitle}>{visit.reason === "Others" ? visit.customReason || "Others" : visit.reason}</Text>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listMeta}>{[visit.visitDate, visit.vaccine].filter(Boolean).join(" • ")}</Text>
                  </View>
                  <Pressable onPress={() => updateForm({ vetVisitRecords: form.vetVisitRecords.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                </Pressable>
              ))}
	              {showVisitEditor ? (
	                <View style={styles.editorStack}>
		                  <Pressable ref={setFieldRef("visitReason")} onPress={() => toggleSelectField("visitReason")} style={[styles.selectField, selectTarget === "visitReason" || focusedField === "visitReason" ? styles.fieldFocusedOutline : null]}>
	                    <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.selectText, !visitDraft.reason ? styles.placeholder : null]}>{visitDraft.reason || "Select"}</Text>
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
	                    <DateField focused={dateTarget === "visitDate" || focusedField === "visitDate"} onBlur={() => { setFocusedField(null); setDateTarget(null); }} onChangeText={(visitDate) => setVisitDraft((current) => ({ ...current, visitDate }))} onFocus={() => focusField("visitDate")} onToggle={() => toggleDateField("visitDate")} value={visitDraft.visitDate} />
	                  </View>
                    <InlineDatePicker onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "visitDate"} />
	                  {visitDraft.reason === "Others" ? (
	                    <View ref={setFieldRef("visitCustomReason")}>
	                      <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(customReason) => setVisitDraft((current) => ({ ...current, customReason }))} onFocus={() => focusField("visitCustomReason")} placeholder="Custom reason" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[styles.input, focusedField === "visitCustomReason" ? styles.inputFocused : null]} value={visitDraft.customReason || ""} />
	                    </View>
	                  ) : null}
	                  {visitDraft.reason === "Vaccination" ? (
	                    vaccineOptions ? (
                        <>
		                        <Pressable ref={setFieldRef("vaccine")} onPress={() => toggleSelectField("vaccine")} style={[styles.selectField, selectTarget === "vaccine" || focusedField === "vaccine" ? styles.fieldFocusedOutline : null]}>
	                          <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.selectText, !visitDraft.vaccine ? styles.placeholder : null]}>{visitDraft.vaccine || "Select"}</Text>
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
	                        <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(vaccine) => setVisitDraft((current) => ({ ...current, vaccine }))} onFocus={() => focusField("vaccine")} placeholder="Vaccine" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[styles.input, focusedField === "vaccine" ? styles.inputFocused : null]} value={visitDraft.vaccine || ""} />
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
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listTitle}>{reminder.reason === "Others" ? reminder.customReason || "Others" : reminder.reason}</Text>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listMeta}>{reminder.reminderDate}</Text>
                  </View>
                  <Pressable onPress={() => updateForm({ reminders: form.reminders.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                </Pressable>
              ))}
	              {showReminderEditor ? (
	                <View style={styles.editorStack}>
		                  <Pressable ref={setFieldRef("reminderReason")} onPress={() => toggleSelectField("reminderReason")} style={[styles.selectField, selectTarget === "reminderReason" || focusedField === "reminderReason" ? styles.fieldFocusedOutline : null]}>
	                    <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.selectText, !reminderDraft.reason ? styles.placeholder : null]}>{reminderDraft.reason || "Select"}</Text>
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
	                    <DateField focused={dateTarget === "reminderDate" || focusedField === "reminderDate"} onBlur={() => { setFocusedField(null); setDateTarget(null); }} onChangeText={(reminderDate) => setReminderDraft((current) => ({ ...current, reminderDate }))} onFocus={() => focusField("reminderDate")} onToggle={() => toggleDateField("reminderDate")} value={reminderDraft.reminderDate} />
	                  </View>
                    <InlineDatePicker futureYearLimit={3} minDate={tomorrowIsoDate()} onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "reminderDate"} />
	                  {reminderDraft.reason === "Others" ? (
	                    <View ref={setFieldRef("reminderCustomReason")}>
	                      <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(customReason) => setReminderDraft((current) => ({ ...current, customReason }))} onFocus={() => focusField("reminderCustomReason")} placeholder="Custom reason" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[styles.input, focusedField === "reminderCustomReason" ? styles.inputFocused : null]} value={reminderDraft.customReason || ""} />
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
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listTitle}>{medication.name}</Text>
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.listMeta}>
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
	                    <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple" onBlur={() => setFocusedField(null)} onChangeText={(name) => setMedicationDraft((current) => ({ ...current, name }))} onFocus={() => focusField("medicationName")} placeholder="Medication name" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} style={[styles.input, focusedField === "medicationName" ? styles.inputFocused : null]} value={medicationDraft.name} />
	                  </View>
	                  <View style={styles.medicationCompositeRow}>
	                    <View ref={setFieldRef("doseAmount")} style={styles.medicationCompositeBlock}>
		                      <View style={[styles.compositeField, focusedField === "doseAmount" || selectTarget === "doseUnit" ? styles.fieldFocusedOutline : null]}>
	                        <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
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
	                          <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.compositeFieldSelectText, !medicationDraft.dose_unit ? styles.placeholder : null]}>{medicationDraft.dose_unit || "Select"}</Text>
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
		                      <View style={[styles.compositeField, focusedField === "frequencyValue" || selectTarget === "frequencyUnit" ? styles.fieldFocusedOutline : null]}>
	                        <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
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
	                          <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.compositeFieldSelectText, !medicationDraft.frequency_unit ? styles.placeholder : null]}>{medicationDraft.frequency_unit || "Select"}</Text>
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
          </NativeCollapsibleSection>

          <View style={styles.switchStack}>
            {familyPetContext?.family_linked && familyPetContext.is_creator ? (
              <View style={styles.switchRow}>
                <View style={styles.flexOne}>
                  <Text style={styles.switchTitle}>Share with family</Text>
                </View>
                <InlineToggle
                  checked={form.shareWithFamily}
                  disabled={!familyPetContext.can_share_with_family}
                  onPress={() => updateForm({ shareWithFamily: !form.shareWithFamily })}
                />
              </View>
            ) : null}
            <View style={styles.switchRow}>
              <View style={styles.flexOne}>
                <Text style={styles.switchTitle}>Public Profile</Text>
                <Text style={styles.switchHelp}>Show this pet publicly</Text>
              </View>
              <InlineToggle checked={form.isPublic} onPress={() => updateForm({ isPublic: !form.isPublic })} />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.flexOne}>
                <Text style={styles.switchTitle}>Still Active</Text>
                <Text style={styles.switchHelp}>Is this pet still with you?</Text>
              </View>
              <InlineToggle checked={form.isActive} onPress={() => updateForm({ isActive: !form.isActive })} />
            </View>
            {!onboardingMode && profileMode === "edit" && savedPetId && !isNewPet ? (
              <Pressable disabled={saving} onPress={familyPetContext?.is_family_shared ? () => void removeSharedPet() : confirmRemovePet} style={({ pressed }) => [styles.removeInlineButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
                <Text style={styles.removeInlineButtonText}>{familyPetContext?.is_family_shared ? "Remove from my profile" : "Remove Pet"}</Text>
              </Pressable>
            ) : null}
          </View>
          {message ? <Text style={message === "Draft saved" ? styles.successText : styles.errorText}>{message}</Text> : null}
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
            <Animated.View style={saveShakeStyle}>
              <Pressable disabled={saving} onPress={() => void savePet(false)} style={({ pressed }) => [styles.primaryButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
                {saving ? <NativeSpinner tone="primary" /> : <Text style={styles.primaryButtonText}>Complete profile</Text>}
              </Pressable>
            </Animated.View>
            <Pressable disabled={saving} onPress={() => void savePet(true)} style={({ pressed }) => [styles.draftButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
              <Text style={styles.draftButtonText}>Save Draft</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <NativeMediaImageCropper
        asset={petCropAsset}
        aspect="4/5"
        onCancel={() => {
          void cleanupNativeProfilePhotoTemporaryAsset(petCropAsset);
          setPetCropAsset(null);
          setEditingExistingPetPhoto(false);
        }}
        onError={(message) => setMessage(message)}
        onSave={handlePetPhotoCropped}
        initialPresentationCrop={homeCrop}
        presentationCropAspect={huddlePetPhoto.bannerAspect}
        presentationCropLabel="Home banner"
        title="Adjust pet photo"
      />
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
    backgroundColor: huddleColors.canvas,
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
  petViewContent: {
    gap: 0,
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
    alignItems: "center",
  },
	  section: {
	    gap: huddleSpacing.x2,
	  },
  sectionBody: {
    gap: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x2,
  },
  identityFieldGroup: {
    gap: huddleSpacing.x1,
  },
  petSizeField: {
    // The parent group already adds x1; add the remainder so Breed-to-label matches Gender's x5 boundary.
    marginTop: huddleSpacing.x5 - huddleSpacing.x1,
    gap: huddleSpacing.x1,
  },
  compactFieldGroup: {
    gap: huddleSpacing.x1,
  },
  sectionTitle: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    letterSpacing: 0.8,
  },
  label: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleFormFields.background,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
    overflow: "hidden",
  },
  inputFocused: {
    ...huddleFieldStates.focused,
  },
  fieldFocusedOutline: {
    ...huddleFieldStates.focused,
  },
  microchipInput: {
    fontFamily: Platform.select({
      ios: "Courier",
      default: "monospace",
    }),
  },
  textArea: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    paddingTop: huddleSpacing.x3,
    textAlignVertical: "top",
  },
	  textAreaSmall: {
	    height: huddleFormFields.multilineHeight,
	    maxHeight: huddleFormFields.multilineHeight,
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
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
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
	    paddingHorizontal: huddleSpacing.x2,
	    alignItems: "center",
	    justifyContent: "center",
	    borderWidth: 1,
	    borderColor: huddleColors.glassBorder,
	    backgroundColor: huddleColors.glassChrome,
	    ...huddleShadows.glassElevation1,
	  },
  twoColumn: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    alignItems: "flex-start",
  },
  dateWeightRow: {
    alignItems: "flex-start",
  },
  dateOfBirthColumn: {
    flex: 1.25,
    minWidth: 0,
  },
  weightColumn: {
    flex: 0.75,
    minWidth: 0,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  fieldStack: {
    gap: huddleSpacing.x2,
  },
	  switchCard: {
	    minHeight: 40,
	    flex: 1,
	    borderRadius: huddleRadii.pill,
	    borderWidth: 1,
	    borderColor: huddleColors.glassBorder,
	    backgroundColor: huddleColors.glassChrome,
	    ...huddleShadows.glassElevation1,
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
    alignSelf: "flex-end",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
    paddingHorizontal: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  checkboxPillLabel: {
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
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleFormFields.background,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: huddleSpacing.x4,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  unitInput: {
    flex: 1,
    height: huddleLayout.fieldHeight,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
  },
  unitPill: {
    minWidth: 44,
    height: 32,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: huddleSpacing.x2,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
  },
  unitText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
  },
  selectField: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleFormFields.background,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  selectText: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
  },
  petTypeSelectTrigger: {
    minHeight: huddleLayout.fieldHeight - 2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeSelectValueRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  petTypeEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  petTypeSelectValue: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
  },
  inlinePopover: {
    overflow: "hidden",
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleFormControls.select.menuBorderColor,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  inlinePopoverBorderless: {
    borderWidth: 0,
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
  optionLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  optionEmoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  optionCheckSpacer: {
    width: huddleFormControls.select.checkSlot,
    height: huddleFormControls.select.checkSlot,
  },
  dateField: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleFormFields.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  dateFieldInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    overflow: "hidden",
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
    flexShrink: 1,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x3,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
    overflow: "hidden",
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
    fontSize: huddleFormFields.valueSize,
    lineHeight: huddleFormFields.valueLine,
  },
  subCard: {
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation1,
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
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassElevation1,
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
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    marginTop: huddleSpacing.x1,
  },
  webToggleTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    borderRadius: huddleRadii.pill,
    justifyContent: "center",
    paddingHorizontal: 3,
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
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    marginTop: -huddleSpacing.x1,
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
    alignSelf: "flex-start",
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x1,
  },
  removeInlineButtonText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
    textDecorationLine: "underline",
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
