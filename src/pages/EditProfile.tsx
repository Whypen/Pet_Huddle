import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { Camera, Loader2, Check, Save, Car, X, Pencil, MapPin, Plus, Eye, Calendar, ArrowLeft, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuButton } from "@/components/ui/NeuButton";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuDropdown } from "@/components/ui/NeuDropdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { ErrorLabel } from "@/components/ui/ErrorLabel";
import { PublicProfileView } from "@/components/profile/PublicProfileView";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSignup } from "@/contexts/SignupContext";
import imageCompression from "browser-image-compression";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { requestPhoneOtp as requestPhoneOtpCode, verifyPhoneOtp as verifyPhoneOtpCode } from "@/lib/phoneOtp";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isPhoneCountryAllowed } from "@/config/allowedSmsCountries";
import { CANONICAL_GENDER_OPTIONS, CANONICAL_ORIENTATION_OPTIONS, CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS, CANONICAL_SOCIAL_ROLE_OPTIONS } from "@/lib/profileOptions";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlMap } from "@/lib/socialAlbum";
import {
  clearPendingSignupVerification,
  loadPendingSignupVerification,
  SETPET_PREFILL_KEY,
  SETPROFILE_PREFILL_KEY,
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_PENDING_VERIFICATION_KEY,
  SIGNUP_STORAGE_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";
import { useFormDraftAutosave } from "@/hooks/useFormDraftAutosave";
import {
  draftKeys,
  isPersistableImageUrl,
  isPersistableStoragePath,
  type DraftMode,
  type StoredFormDraft,
} from "@/lib/formDraftConfigs";
import { FormDraftStatus } from "@/components/ui/FormDraftStatus";

// Option constants matching database schema
const genderOptions = CANONICAL_GENDER_OPTIONS.filter(o => o !== "Prefer not to say");
const orientationOptions = CANONICAL_ORIENTATION_OPTIONS.filter(o => o !== "Prefer not to say");
const degreeOptions = ["College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD"];
const relationshipOptions = ["Single", "In a relationship", "Open relationship", "Married", "Divorced"];
const petExperienceOptions = [...CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS];
const languageOptions = ["English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian", "Arabic", "Hindi", "Bengali", "Urdu", "Russian", "Turkish", "Thai", "Vietnamese", "Indonesian", "Malay", "Tamil", "Telugu", "Polish", "Dutch", "Swedish"];
const availabilityOptions = [...CANONICAL_SOCIAL_ROLE_OPTIONS];
const NUMERIC_ONLY_REGEX = /^\d+$/;
const DECIMAL_NUMBER_REGEX = /^\d+(?:\.\d+)?$/;
const REQUIRED_CONNECT_ERROR = "Required to help others connect with you";
const PROFILE_WRITE_SCHEMA_DRIFT_ERROR = "Profile schema is updating. Saved compatible fields.";
const EXPERIENCE_YEARS_ERROR = "Tell us how many years you’ve cared for pets";
const isAlreadyRegisteredError = (message: string) =>
  message.toLowerCase().includes("already") && message.toLowerCase().includes("registered");
const humanizeNumericDbError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes("invalid input syntax for type integer")) return "Input must be a whole number";
  return message;
};
const describeSupabaseWriteError = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error_description === "string" && candidate.error_description.trim()) return candidate.error_description;
    if (typeof candidate.details === "string" && candidate.details.trim()) return candidate.details;
    if (typeof candidate.hint === "string" && candidate.hint.trim()) return candidate.hint;
    try {
      return JSON.stringify(candidate);
    } catch {
      return String(error);
    }
  }
  return String(error);
};
const normalizeSocialRole = (value: string) => (value === "Vet" ? "Veterinarian" : value);
const DEFAULT_ROLE_WITH_PETS = "Pet Parent";
const DEFAULT_ROLE_WITHOUT_PETS = "Animal Friend (No Pet)";

const inferCountryCodeFromPhone = (phone: string): string => {
  const normalized = phone.replace(/\s+/g, "");
  if (normalized.startsWith("+852")) return "HK";
  if (normalized.startsWith("+1")) return "US";
  if (normalized.startsWith("+44")) return "GB";
  if (normalized.startsWith("+65")) return "SG";
  if (normalized.startsWith("+81")) return "JP";
  if (normalized.startsWith("+82")) return "KR";
  if (normalized.startsWith("+886")) return "TW";
  if (normalized.startsWith("+61")) return "AU";
  if (normalized.startsWith("+91")) return "IN";
  return "";
};

const maskPhoneForOtpNotice = (phone: string): string => {
  const trimmed = String(phone || "").trim();
  if (!trimmed.startsWith("+")) return "••••";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "••••";
  const countryLen = digits.length <= 10 ? Math.max(1, digits.length - 4) : Math.max(1, digits.length - 8);
  const country = digits.slice(0, countryLen);
  const last4 = digits.slice(-4).padStart(4, "•");
  return `+${country} •••• ${last4}`;
};

const normalizePhoneForCompare = (phone: string): string =>
  String(phone || "")
    .trim()
    .replace(/[^\d+]/g, "");

const isCanonicalPhoneVerified = (
  phoneValue: string,
  profilePhone: string | null | undefined,
  profilePhoneVerificationStatus: string | null | undefined,
  profilePhoneVerifiedAt: string | null | undefined,
) => {
  const normalizedPhone = normalizePhoneForCompare(phoneValue);
  if (!normalizedPhone) return false;
  return (
    profilePhoneVerificationStatus === "verified" &&
    Boolean(profilePhoneVerifiedAt) &&
    normalizePhoneForCompare(profilePhone || "") === normalizedPhone
  );
};

const isRenderableImageSrc = (value: string): boolean => {
  const src = String(value || "").trim();
  if (!src) return false;
  if (src.startsWith("blob:") || src.startsWith("data:")) return true;
  return /^https?:\/\//i.test(src);
};

const extractDistrictFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
};

const extractCountryFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "";
};

const enforceAvailabilityDefaults = (current: string[], hasPets: boolean) => {
  const unique = Array.from(new Set(current.map(normalizeSocialRole).filter(Boolean)));
  const withoutOpposite = hasPets
    ? unique.filter((role) => role !== DEFAULT_ROLE_WITHOUT_PETS)
    : unique.filter((role) => role !== DEFAULT_ROLE_WITH_PETS);
  const requiredDefault = hasPets ? DEFAULT_ROLE_WITH_PETS : DEFAULT_ROLE_WITHOUT_PETS;
  return withoutOpposite.includes(requiredDefault)
    ? withoutOpposite
    : [requiredDefault, ...withoutOpposite];
};

const isAtLeast13FromDate = (isoDate: string): boolean => {
  if (!isoDate) return false;
  const dob = new Date(isoDate);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 13;
};

const isAtLeast16FromDate = (isoDate: string): boolean => {
  if (!isoDate) return false;
  const dob = new Date(isoDate);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 16;
};

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryOptions = Array.from({ length: 26 * 26 }, (_, idx) => {
  const a = String.fromCharCode(65 + Math.floor(idx / 26));
  const b = String.fromCharCode(65 + (idx % 26));
  const code = `${a}${b}`;
  const label = countryDisplayNames.of(code);
  return label && label !== code && !label.toLowerCase().includes("unknown") ? { code, label } : null;
}).filter((item): item is { code: string; label: string } => Boolean(item))
  .sort((a, b) => a.label.localeCompare(b.label));

type EditProfileProps = {
  onboardingMode?: boolean;
};

type UploadLifecycleStatus = "idle" | "uploading" | "success" | "error";

type UploadProgressState = {
  status: UploadLifecycleStatus;
  progress: number;
};

type PendingSocialUpload = {
  id: string;
  previewUrl: string;
  progress: number;
  status: UploadLifecycleStatus;
};

const EditProfile = ({ onboardingMode = false }: EditProfileProps) => {
  const { t } = useLanguage();
  const showTurnstileDiag =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("turnstile_diag") === "1";
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { data: signupData, reset: resetSignup, setFlowState } = useSignup();
  const [loading, setLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [petsProfileCount, setPetsProfileCount] = useState(0);
  const [activePetHeads, setActivePetHeads] = useState<Array<{ id: string; name?: string | null; species?: string | null; photoUrl?: string | null }>>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [resolvedLocationCountry, setResolvedLocationCountry] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ label: string; lat: number; lng: number; district: string; country: string }>>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [displayNameEditMode, setDisplayNameEditMode] = useState(false);
  const [socialIdEditMode, setSocialIdEditMode] = useState(false);
  const [socialIdStatus, setSocialIdStatus] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpUnavailable, setPhoneOtpUnavailable] = useState(false);
  const [phoneOtpMessage, setPhoneOtpMessage] = useState<string | null>(null);
  const [phoneSentMaskedHint, setPhoneSentMaskedHint] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const otpCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Clear the countdown timer on unmount to avoid state updates on dead components
  useEffect(() => () => { if (otpCountdownRef.current) clearInterval(otpCountdownRef.current); }, []);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [savedPhoneVerified, setSavedPhoneVerified] = useState(false);
  const phoneOtpTurnstile = useTurnstile("send_pre_signup_verify");
  const [phoneOriginalValue, setPhoneOriginalValue] = useState("");
  // Duplicate-phone detection for the edit-phone flow.
  // Only runs when the user has changed the phone from its saved value.
  const [phoneDuplicate, setPhoneDuplicate] = useState(false);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const phoneDuplicateCheckRef = useRef(0);
  const [dobEditMode, setDobEditMode] = useState(false);
  const [profileMode, setProfileMode] = useState<"edit" | "view">("edit");
  const isIdentityLocked = profile?.is_verified === true;
  const [socialAlbumUrls, setSocialAlbumUrls] = useState<Record<string, string>>({});
  const [socialAlbumFallbackPreviews, setSocialAlbumFallbackPreviews] = useState<Record<string, string>>({});
  const [socialAlbumLoadErrors, setSocialAlbumLoadErrors] = useState<Record<string, boolean>>({});
  const [photoUploadState, setPhotoUploadState] = useState<UploadProgressState>({ status: "idle", progress: 0 });
  const [pendingSocialUploads, setPendingSocialUploads] = useState<PendingSocialUpload[]>([]);
  const [recentlyUploadedAlbumPaths, setRecentlyUploadedAlbumPaths] = useState<Record<string, boolean>>({});
  const pendingPhotoUploadRef = useRef<Promise<string | null> | null>(null);
  const pendingSocialUploadRefs = useRef<Map<string, Promise<string | null>>>(new Map());
  const socialAlbumRef = useRef<string[]>([]);
  // RULE 14 — keyboard-safe layout: track virtual keyboard offset
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const resolveSetProfilePrefillKey = useCallback(() => {
    if (!onboardingMode) return null;
    // Accept either the signup-context email or the auth user's email as the owner,
    // so the prefill key resolves correctly even when the user is already logged in.
    const normalizedOwner = normalizeStorageOwner(signupData.email || user?.email || "");
    if (!normalizedOwner) return null;
    return buildScopedStorageKey(SETPROFILE_PREFILL_KEY, normalizedOwner);
  }, [onboardingMode, signupData.email, user?.email]);

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

  const [fieldErrors, setFieldErrors] = useState({
    legalName: "",
    displayName: "",
    social_id: "",
    phone: "",
    dob: "",
    gender: "",
    location: "",
    petExperience: "",
    socialAvailability: "",
    height: "",
    weight: "",
    school: "",
    major: "",
    occupation: "",
    experienceYears: "",
  });

  const [formData, setFormData] = useState({
    // Basic Info
    display_name: "",
    legal_name: "",
    phone: "",
    dob: "",
    bio: "",
    social_id: "",

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
    location_country: "",
    location_district: "",
    social_album: [] as string[],

    // Pet Experience
    pet_experience: [] as string[],
    experience_years: "",

    // Social Settings
    owns_pets: false,
    non_social: false,
    availability_status: [] as string[],

    // Privacy toggles
    show_gender: false,
    show_orientation: false,
    show_age: false,
    show_height: false,
    show_weight: false,
    show_academic: false,
    show_affiliation: false,
    show_occupation: false,
    show_bio: false,
    show_relationship_status: false,
    show_languages: false,
    show_location: false,
  });
  const profileDraftMode: DraftMode = onboardingMode ? "local-only" : "local-and-remote";
  const resolveProfileDraftKey = useCallback(() => (
    onboardingMode
      ? draftKeys.setProfile(user?.id || signupData.email || "")
      : draftKeys.editProfile(user?.id || "")
  ), [onboardingMode, signupData.email, user?.id]);
  const getProfileDraftValue = useCallback((value: typeof formData) => ({
    display_name: value.display_name,
    legal_name: value.legal_name,
    phone: value.phone,
    dob: value.dob,
    bio: value.bio,
    social_id: value.social_id,
    gender_genre: value.gender_genre,
    orientation: value.orientation,
    height: value.height,
    weight: value.weight,
    weight_unit: value.weight_unit,
    degree: value.degree,
    school: value.school,
    major: value.major,
    affiliation: value.affiliation,
    occupation: value.occupation,
    relationship_status: value.relationship_status,
    has_car: value.has_car,
    languages: value.languages,
    location_name: value.location_name,
    location_country: value.location_country,
    location_district: value.location_district,
    social_album: canonicalizeSocialAlbumEntries(value.social_album.filter((entry) => isPersistableStoragePath(entry))),
    pet_experience: value.pet_experience,
    experience_years: value.experience_years,
    owns_pets: value.owns_pets,
    availability_status: value.availability_status,
    show_gender: value.show_gender,
    show_orientation: value.show_orientation,
    show_age: value.show_age,
    show_height: value.show_height,
    show_weight: value.show_weight,
    show_academic: value.show_academic,
    show_affiliation: value.show_affiliation,
    show_occupation: value.show_occupation,
    show_bio: value.show_bio,
    show_relationship_status: value.show_relationship_status,
    show_languages: value.show_languages,
    show_location: value.show_location,
    avatar_url: isPersistableImageUrl(photoPreview) ? photoPreview : "",
  }), [photoPreview]);
  const hasVerifiedLegalName = Boolean(formData.legal_name?.trim()) && (
    profile?.is_verified === true
    || String(profile?.verification_status || "").toLowerCase() === "verified"
    || String(profile?.card_verification_status || "").toLowerCase() === "passed"
  );

  const showDiscoverAgeInfo = Boolean(formData.dob) && isAtLeast13FromDate(formData.dob) && !isAtLeast16FromDate(formData.dob);

  const getMissingRequiredFieldLabels = (): string[] => {
    const missing: string[] = [];
    const hasPets = petsProfileCount > 0 || formData.owns_pets;
    if (!formData.display_name.trim()) missing.push("Display/User Name");
    if (!formData.phone.trim()) missing.push("Phone");
    if (!formData.dob) missing.push("Date of Birth");
    if (!formData.gender_genre.trim()) missing.push("Gender");
    if (!formData.location_country.trim() || !formData.location_district.trim()) missing.push("Location");
    if (!formData.social_id.trim()) missing.push("Social ID");
    if (hasPets && (formData.pet_experience.length === 0 || formData.pet_experience.includes("None"))) {
      missing.push("Experience with");
    } else if (!hasPets && formData.pet_experience.length === 0) {
      missing.push("Experience with");
    }
    if (formData.availability_status.length === 0) missing.push("Social role");
    if (hasPets && (!formData.experience_years || Number(formData.experience_years) < 0 || Number(formData.experience_years) > 99)) {
      missing.push("Years of Experience");
    }
    return Array.from(new Set(missing));
  };

  const formatMissingFieldsToast = (missingFields: string[]): string => {
    const normalized = missingFields.map((field) =>
      field === "Experience with" ? "experience with pets" : field
    );
    const suffix = normalized.length > 1 ? "fields" : "field";
    return `Almost there – fill in the ${normalized.join(", ")} ${suffix} to complete your profile!`;
  };

  const scrollToProfileField = useCallback((fieldId: string) => {
    if (typeof window === "undefined") return;
    const target = document.getElementById(`profile-field-${fieldId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      const focusTarget = target.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
      focusTarget?.focus({ preventScroll: true });
    }, 180);
  }, []);

  const focusFirstMissingRequiredField = useCallback((missingFields: string[]) => {
    const keyByLabel: Record<string, string> = {
      "Display/User Name": "display-name",
      "Phone": "phone",
      "Date of Birth": "dob",
      "Gender": "gender",
      "Location": "location",
      "Social ID": "social-id",
      "Experience with": "pet-experience",
      "Social role": "social-role",
      "Years of Experience": "experience-years",
    };
    const first = missingFields.find((field) => keyByLabel[field]);
    if (!first) return;
    scrollToProfileField(keyByLabel[first]);
  }, [scrollToProfileField]);

  type VisibilityField =
    | "show_gender"
    | "show_orientation"
    | "show_age"
    | "show_height"
    | "show_weight"
    | "show_academic"
    | "show_affiliation"
    | "show_occupation"
    | "show_bio"
    | "show_relationship_status"
    | "show_languages"
    | "show_location";

  const handleVisibilityToggle = useCallback((field: VisibilityField, checked: boolean) => {
    if (!checked) {
      setFormData((prev) => ({ ...prev, [field]: false }));
      return;
    }
    const requirements: Record<VisibilityField, { ready: boolean; message: string; scrollKey?: string; errorKey?: keyof typeof fieldErrors }> = {
      show_gender: { ready: Boolean(formData.gender_genre.trim()), message: "Complete Gender first.", scrollKey: "gender", errorKey: "gender" },
      show_orientation: { ready: Boolean(formData.orientation.trim()), message: "Complete Sexual Orientation first." },
      show_age: { ready: Boolean(formData.dob), message: "Complete Date of Birth first.", scrollKey: "dob", errorKey: "dob" },
      show_height: { ready: Boolean(formData.height.trim()), message: "Complete Height first.", scrollKey: "height", errorKey: "height" },
      show_weight: { ready: Boolean(formData.weight.trim()), message: "Complete Weight first.", errorKey: "weight" },
      show_academic: { ready: Boolean(formData.degree.trim() || formData.school.trim() || formData.major.trim()), message: "Complete Education & Career first." },
      show_affiliation: { ready: Boolean(formData.affiliation.trim()), message: "Complete Affiliation first." },
      show_occupation: { ready: Boolean(formData.occupation.trim()), message: "Complete Occupation first." },
      show_bio: { ready: Boolean(formData.bio.trim()), message: "Complete Bio first.", scrollKey: "bio" },
      show_relationship_status: { ready: Boolean(formData.relationship_status.trim()), message: "Complete Relationship Status first." },
      show_languages: { ready: formData.languages.length > 0, message: "Select at least one language first." },
      show_location: { ready: Boolean(formData.location_country.trim() && formData.location_district.trim()), message: "Complete Location first.", scrollKey: "location", errorKey: "location" },
    };
    const requirement = requirements[field];
    if (!requirement.ready) {
      if (requirement.errorKey) {
        setFieldErrors((prev) => ({ ...prev, [requirement.errorKey]: REQUIRED_CONNECT_ERROR }));
      }
      if (requirement.scrollKey) {
        scrollToProfileField(requirement.scrollKey);
      }
      toast.error(requirement.message);
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: true }));
  }, [formData, scrollToProfileField]);

  const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  };

  const startUploadProgressTicker = useCallback(
    (setter: Dispatch<SetStateAction<UploadProgressState>>) => {
      setter({ status: "uploading", progress: 8 });
      const interval = window.setInterval(() => {
        setter((prev) => {
          if (prev.status !== "uploading") return prev;
          return { ...prev, progress: Math.min(prev.progress + 6, 92) };
        });
      }, 180);
      return () => window.clearInterval(interval);
    },
    [],
  );

  const uploadProfilePhotoFile = useCallback(async (file: File, activeUserId: string): Promise<string | null> => {
    const stopTicker = startUploadProgressTicker(setPhotoUploadState);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${activeUserId}/avatar_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      setPhotoPreview(publicUrl);
      setPhotoFile(null);
      setPhotoUploadState({ status: "success", progress: 100 });
      window.setTimeout(() => setPhotoUploadState({ status: "idle", progress: 0 }), 1400);
      return publicUrl;
    } catch (error) {
      console.warn("[EditProfile.photoUpload]", error);
      setPhotoUploadState({ status: "error", progress: 0 });
      window.setTimeout(() => setPhotoUploadState({ status: "idle", progress: 0 }), 2200);
      throw error;
    } finally {
      stopTicker();
    }
  }, [startUploadProgressTicker]);

  const waitForMediaUploads = useCallback(async () => {
    const allPromises: Promise<string | null>[] = [];
    if (pendingPhotoUploadRef.current) {
      allPromises.push(pendingPhotoUploadRef.current);
    }
    if (pendingSocialUploadRefs.current.size > 0) {
      allPromises.push(...pendingSocialUploadRefs.current.values());
    }
    if (allPromises.length === 0) return;
    await Promise.all(allPromises);
  }, []);

  const markAlbumUploadSuccess = useCallback((path: string) => {
    setRecentlyUploadedAlbumPaths((prev) => ({ ...prev, [path]: true }));
    window.setTimeout(() => {
      setRecentlyUploadedAlbumPaths((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }, 1800);
  }, []);

  const finalizePendingVerification = async (activeUserId: string) => {
    const pendingVerification = loadPendingSignupVerification(signupData.email || user?.id || "");
    if (!pendingVerification) return;

    const mappedDocType =
      pendingVerification.docType === "id"
        ? "id_card"
        : pendingVerification.docType === "drivers_license"
          ? "drivers_license"
          : pendingVerification.docType;

    const [selfieFile, idFile] = await Promise.all([
      dataUrlToFile(pendingVerification.selfieDataUrl, "selfie.jpg"),
      dataUrlToFile(pendingVerification.idDataUrl, "id.jpg"),
    ]);

    const uploadVerificationAsset = async (file: File, label: string) => {
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${activeUserId}/${label}_${Date.now()}.${extension}`;
      const { error } = await supabase.storage
        .from("identity_verification")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      return path;
    };

    const [selfieUrl, idUrl] = await Promise.all([
      uploadVerificationAsset(selfieFile, "selfie"),
      uploadVerificationAsset(idFile, "id"),
    ]);

    const { error: uploadRowError } = await supabase
      .from("verification_uploads")
      .insert({
        user_id: activeUserId,
        document_type: mappedDocType,
        document_url: idUrl,
        selfie_url: selfieUrl,
        country: pendingVerification.country,
        status: "pending",
      });
    if (uploadRowError) throw uploadRowError;

    const { error: profileVerificationError } = await supabase
      .from("profiles")
      .update({
        verification_comment: null,
        verification_document_url: idUrl,
      })
      .eq("id", activeUserId);
    if (profileVerificationError) throw profileVerificationError;

    const { error: auditError } = await supabase.from("admin_audit_logs").insert({
      admin_id: activeUserId,
      action: "kyc_submitted",
      target_user_id: activeUserId,
      details: {
        country: pendingVerification.country,
        docType: pendingVerification.docType,
        selfieUrl,
        idUrl,
        source: "signup_onboarding",
      },
    });
    if (auditError) {
      console.warn("[EditProfile] Failed to write signup KYC audit log:", auditError.message);
    }

    clearPendingSignupVerification(signupData.email || user?.id || "");
    try {
      sessionStorage.removeItem("huddle_vi_status");
      sessionStorage.removeItem("signup_verify_submitted_v1");
      sessionStorage.removeItem("signup_verify_docs_submitted");
    } catch {
      // no-op
    }
  };

  const validateRequiredFields = () => {
    const nextErrors: typeof fieldErrors = {
      ...fieldErrors,
      legalName: "",
      displayName: formData.display_name.trim() ? "" : REQUIRED_CONNECT_ERROR,
      phone: formData.phone.trim() ? "" : REQUIRED_CONNECT_ERROR,
      dob: formData.dob ? "" : REQUIRED_CONNECT_ERROR,
      gender: formData.gender_genre.trim() ? "" : REQUIRED_CONNECT_ERROR,
      location: formData.location_country.trim() && formData.location_district.trim() ? "" : REQUIRED_CONNECT_ERROR,
      petExperience:
        (petsProfileCount > 0 || formData.owns_pets)
          ? (formData.pet_experience.length > 0 && !formData.pet_experience.includes("None") ? "" : REQUIRED_CONNECT_ERROR)
          : (formData.pet_experience.length > 0 ? "" : REQUIRED_CONNECT_ERROR),
      socialAvailability: formData.availability_status.length > 0 ? "" : REQUIRED_CONNECT_ERROR,
      social_id: formData.social_id.trim() ? "" : REQUIRED_CONNECT_ERROR,
    };
    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  };

  const resolvePhoneVerifiedForValue = useCallback(async (phoneValue: string, userId?: string | null) => {
    if (!userId) return false;
    return isCanonicalPhoneVerified(
      phoneValue,
      profile?.phone,
      profile?.phone_verification_status,
      profile?.phone_verified_at,
    );
  }, [profile?.phone, profile?.phone_verification_status, profile?.phone_verified_at]);

  useEffect(() => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      let changed = false;
      const hasPets = petsProfileCount > 0 || formData.owns_pets;
      const validYears =
        !!formData.experience_years &&
        Number.isInteger(Number(formData.experience_years)) &&
        Number(formData.experience_years) >= 0 &&
        Number(formData.experience_years) <= 99;

      if (next.legalName) { next.legalName = ""; changed = true; }
      if (next.displayName && formData.display_name.trim()) { next.displayName = ""; changed = true; }
      if (next.phone && formData.phone.trim()) { next.phone = ""; changed = true; }
      if (next.dob && formData.dob) { next.dob = ""; changed = true; }
      if (next.gender && formData.gender_genre.trim()) { next.gender = ""; changed = true; }
      if (next.location && formData.location_country.trim() && formData.location_district.trim()) { next.location = ""; changed = true; }
      if (next.social_id && formData.social_id.trim()) { next.social_id = ""; changed = true; }
      if (next.socialAvailability && formData.availability_status.length > 0) { next.socialAvailability = ""; changed = true; }
      if (next.petExperience) {
        const validExperience = hasPets
          ? (formData.pet_experience.length > 0 && !formData.pet_experience.includes("None"))
          : formData.pet_experience.length > 0;
        if (validExperience) { next.petExperience = ""; changed = true; }
      }
      if (next.experienceYears && (!hasPets || validYears)) { next.experienceYears = ""; changed = true; }
      return changed ? next : prev;
    });
  }, [
    formData.display_name,
    formData.phone,
    formData.dob,
    formData.gender_genre,
    formData.location_country,
    formData.location_district,
    formData.location_name,
    formData.social_id,
    formData.availability_status,
    formData.pet_experience,
    formData.experience_years,
    formData.owns_pets,
    petsProfileCount,
  ]);

  // RULE 14 — keyboard-safe layout via visualViewport API
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };
    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", onResize);
    onResize();
    return () => {
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", onResize);
    };
  }, []);

  const releaseSocialAlbumFallbackPreview = useCallback((path: string) => {
    setSocialAlbumFallbackPreviews((prev) => {
      const current = prev[path];
      if (!current) return prev;
      window.setTimeout(() => URL.revokeObjectURL(current), 0);
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const refreshSocialAlbumUrls = useCallback(async (
    paths: string[],
    options?: { allowClear?: boolean },
  ): Promise<Record<string, string>> => {
    const normalizedPaths = canonicalizeSocialAlbumEntries(paths);
    if (!normalizedPaths.length) {
      if (options?.allowClear) {
        setSocialAlbumUrls({});
      }
      return {};
    }
    const next = await resolveSocialAlbumUrlMap(normalizedPaths, 60 * 60);
    if (!Object.keys(next).length) return {};
    setSocialAlbumUrls((prev) => ({ ...prev, ...next }));
    setSocialAlbumLoadErrors((prev) => {
      const hasAny = Object.keys(prev).length > 0;
      if (!hasAny) return prev;
      const updated = { ...prev };
      let changed = false;
      for (const path of Object.keys(next)) {
        if (updated[path]) {
          delete updated[path];
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
    Object.keys(next).forEach((path) => {
      releaseSocialAlbumFallbackPreview(path);
    });
    return next;
  }, [releaseSocialAlbumFallbackPreview]);

  useEffect(() => {
    const prefillKey = resolveSetProfilePrefillKey();
    // Allow reading from localStorage prefill in onboardingMode regardless of auth state,
    // so the form is pre-populated even if SignupContext in-memory state was cleared.
    const allowLocalPrefill = onboardingMode;
    const cachedPrefill = (() => {
      if (!prefillKey || !allowLocalPrefill) return {} as Record<string, unknown>;
      try {
        const raw = localStorage.getItem(prefillKey) || localStorage.getItem(SETPROFILE_PREFILL_KEY) || "{}";
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const cachedDraft = (() => {
      const raw = cachedPrefill.form_data;
      if (!raw) return null;
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    })();
    const expectedPrefillOwner = normalizeStorageOwner(signupData.email || user?.email || "");
    const cachedPrefillOwner = normalizeStorageOwner(
      typeof cachedPrefill.prefill_owner === "string" ? cachedPrefill.prefill_owner : "",
    );
    const trustedPrefill = Boolean(
      expectedPrefillOwner &&
      cachedPrefillOwner &&
      expectedPrefillOwner === cachedPrefillOwner,
    );
    const safeCachedDraft = trustedPrefill ? cachedDraft : null;
    const safeCachedPrefill = trustedPrefill ? cachedPrefill : ({} as Record<string, unknown>);
    const cachedValue = (key: string): string => {
      if (safeCachedDraft && typeof safeCachedDraft[key] === "string") return String(safeCachedDraft[key] || "");
      const legacy = safeCachedPrefill[key];
      return typeof legacy === "string" ? legacy : "";
    };
    const cachedSocialAlbum = (() => {
      if (safeCachedDraft?.social_album && Array.isArray(safeCachedDraft.social_album)) {
        return canonicalizeSocialAlbumEntries(
          (safeCachedDraft.social_album as unknown[]).filter((value): value is string => typeof value === "string"),
        );
      }
      try {
        const raw = typeof safeCachedPrefill.social_album === "string" ? safeCachedPrefill.social_album : "[]";
        const parsed = JSON.parse(raw) as string[];
        return Array.isArray(parsed) ? canonicalizeSocialAlbumEntries(parsed) : [];
      } catch {
        return [] as string[];
      }
    })();
    const signupSeedOwner = normalizeStorageOwner(signupData.email || "");
    const authSeedOwner = normalizeStorageOwner(user?.email || user?.id || "");
    const allowSignupSeed = onboardingMode && Boolean(signupSeedOwner) && (!user?.id || signupSeedOwner === authSeedOwner);
    const authMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const authDisplayNameSeed = typeof authMetadata.display_name === "string" ? authMetadata.display_name.trim() : "";
    const authLegalNameSeed = typeof authMetadata.legal_name === "string" ? authMetadata.legal_name.trim() : "";
    const authSocialIdSeed = typeof authMetadata.social_id === "string" ? authMetadata.social_id.trim() : "";
    const authPhoneMetadataSeed = typeof authMetadata.phone === "string" ? authMetadata.phone.trim() : "";
    const authDobSeed = typeof authMetadata.dob === "string" ? authMetadata.dob.trim() : "";
    const authPhoneSeed = String(user?.phone || authPhoneMetadataSeed || "").trim();
    const signupDob = allowSignupSeed ? signupData.dob : "";
    const signupDisplayName = allowSignupSeed ? signupData.display_name : "";
    const signupSocialId = allowSignupSeed ? signupData.social_id : "";
    const signupPhone = allowSignupSeed ? signupData.phone : "";
    const signupLegalName = allowSignupSeed ? signupData.legal_name : "";
    const displayName = profile?.display_name || signupDisplayName || cachedValue("display_name") || authDisplayNameSeed;
    const legalName = profile?.legal_name || signupLegalName || cachedValue("legal_name") || authLegalNameSeed;
    const phone = profile?.phone || signupPhone || cachedValue("phone") || authPhoneSeed;
    const dob = profile?.dob || signupDob || cachedValue("dob") || authDobSeed;
    const bio = profile?.bio || cachedValue("bio");
    // Normalise to DB constraint: lowercase, only a-z 0-9 . _
    const socialId = (profile?.social_id || signupSocialId || cachedValue("social_id") || authSocialIdSeed)
      .toLowerCase().replace(/[^a-z0-9._]/g, "");
    const genderGenre = profile?.gender_genre || cachedValue("gender_genre");
    const orientation = profile?.orientation || cachedValue("orientation");
    const height = profile?.height?.toString() || cachedValue("height");
    const weight = profile?.weight?.toString() || cachedValue("weight");
    const degree = profile?.degree || cachedValue("degree");
    const school = profile?.school || cachedValue("school");
    const major = profile?.major || cachedValue("major");
    const affiliation = profile?.affiliation || cachedValue("affiliation");
    const occupation = profile?.occupation || cachedValue("occupation");
    const relationshipStatus = profile?.relationship_status || cachedValue("relationship_status");
    const cachedLanguages = Array.isArray(safeCachedDraft?.languages)
      ? (safeCachedDraft?.languages as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    const cachedPetExperience = Array.isArray(safeCachedDraft?.pet_experience)
      ? (safeCachedDraft?.pet_experience as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    const cachedAvailability = Array.isArray(safeCachedDraft?.availability_status)
      ? (safeCachedDraft?.availability_status as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];
    const hasPetsFromProfile = Boolean(profile?.owns_pets);
    const normalizedAvailability = (profile?.availability_status || [])
      .map((status) => normalizeSocialRole(status))
      .filter((status): status is string => Boolean(status));
    const resolvedAvailability = enforceAvailabilityDefaults(
      normalizedAvailability.length > 0 ? normalizedAvailability : cachedAvailability,
      hasPetsFromProfile || Boolean(safeCachedDraft?.owns_pets),
    );
    const locationCountry = profile?.location_country || cachedValue("location_country");
    const locationDistrict = profile?.location_district || cachedValue("location_district");
    const locationName = profile?.location_name || `${locationDistrict}${locationCountry ? `, ${locationCountry}` : ""}`.trim();
    const parsedCountry = locationCountry || locationName.split(",").map((part) => part.trim()).filter(Boolean).pop();
    const matchedCountry = parsedCountry
      ? countryOptions.find((country) => country.label.toLowerCase() === parsedCountry.toLowerCase())
      : null;

    const nextForm = {
      display_name: displayName,
      legal_name: legalName,
      phone,
      dob,
      bio,
      social_id: socialId,
      gender_genre: genderGenre,
      orientation,
      height,
      weight,
      weight_unit: profile?.weight_unit || cachedValue("weight_unit") || "kg",
      degree,
      school,
      major,
      affiliation,
      occupation,
      relationship_status: relationshipStatus,
      has_car: profile?.has_car ?? Boolean(safeCachedDraft?.has_car),
      languages: profile?.languages ?? cachedLanguages,
      location_name: locationName,
      location_country: locationCountry,
      location_district: locationDistrict,
      pet_experience: profile?.pet_experience ?? cachedPetExperience,
      experience_years: profile?.experience_years?.toString() || cachedValue("experience_years"),
      owns_pets: profile?.owns_pets ?? Boolean(safeCachedDraft?.owns_pets),
      non_social: resolvedAvailability.length === 0,
      availability_status: resolvedAvailability,
      show_gender: profile?.show_gender ?? Boolean(safeCachedDraft?.show_gender ?? Boolean(genderGenre.trim())),
      show_orientation: profile?.show_orientation ?? Boolean(safeCachedDraft?.show_orientation ?? Boolean(orientation.trim())),
      show_age: profile?.show_age ?? Boolean(safeCachedDraft?.show_age ?? Boolean(dob)),
      show_height: profile?.show_height ?? Boolean(safeCachedDraft?.show_height ?? Boolean(height)),
      show_weight: profile?.show_weight ?? Boolean(safeCachedDraft?.show_weight ?? Boolean(weight)),
      show_academic: profile?.show_academic ?? Boolean(safeCachedDraft?.show_academic ?? Boolean(degree.trim() || school.trim() || major.trim())),
      show_affiliation: profile?.show_affiliation ?? Boolean(safeCachedDraft?.show_affiliation ?? Boolean(affiliation.trim())),
      show_occupation: profile?.show_occupation ?? Boolean(safeCachedDraft?.show_occupation ?? Boolean(occupation.trim())),
      show_bio: profile?.show_bio ?? Boolean(safeCachedDraft?.show_bio ?? Boolean(bio.trim())),
      show_relationship_status: profile?.show_relationship_status ?? Boolean(safeCachedDraft?.show_relationship_status ?? Boolean(relationshipStatus.trim())),
      show_languages: Boolean((profile?.prefs as Record<string, unknown> | null)?.show_languages ?? safeCachedDraft?.show_languages ?? false),
      show_location: Boolean((profile?.prefs as Record<string, unknown> | null)?.show_location ?? safeCachedDraft?.show_location ?? false),
      social_album: canonicalizeSocialAlbumEntries(profile?.social_album ?? cachedSocialAlbum),
    };
    socialAlbumRef.current = canonicalizeSocialAlbumEntries(profile?.social_album ?? cachedSocialAlbum);
    setSelectedCountry(matchedCountry?.code || "");
    if (profile?.avatar_url) {
      setPhotoPreview(profile.avatar_url);
    } else if (
      allowLocalPrefill &&
      trustedPrefill &&
      typeof safeCachedPrefill.avatar_url === "string"
    ) {
      setPhotoPreview(safeCachedPrefill.avatar_url);
    } else {
      setPhotoPreview(null);
    }
    if (profile?.social_album && profile.social_album.length > 0) {
      refreshSocialAlbumUrls(canonicalizeSocialAlbumEntries(profile.social_album));
    } else if (allowLocalPrefill && cachedSocialAlbum.length > 0) {
      refreshSocialAlbumUrls(canonicalizeSocialAlbumEntries(cachedSocialAlbum));
    }
    setPhoneOriginalValue(phone);
    void resolvePhoneVerifiedForValue(phone, user?.id || profile?.id || null).then((isVerified) => {
      setSavedPhoneVerified(isVerified);
      setPhoneOtpVerified(isVerified);
    });
    setLocationQuery(locationName);
    setResolvedLocationCountry(extractCountryFromPlaceLabel(locationName) || locationCountry || "");
    hydrateProfileDraftFromBaseline({
      baselineValue: nextForm,
      baselineUpdatedAt: String((profile as { updated_at?: string } | null)?.updated_at || null),
      legacyDraft: readLegacySetProfileDraft(),
    });
  }, [
    hydrateProfileDraftFromBaseline,
    onboardingMode,
    profile,
    readLegacySetProfileDraft,
    resolveSetProfilePrefillKey,
    signupData.display_name,
    signupData.dob,
    signupData.email,
    signupData.legal_name,
    signupData.phone,
    signupData.social_id,
    refreshSocialAlbumUrls,
    resolvePhoneVerifiedForValue,
    user?.email,
    user?.id,
    user?.user_metadata,
    user?.phone,
  ]);

  useEffect(() => {
    socialAlbumRef.current = canonicalizeSocialAlbumEntries(formData.social_album);
  }, [formData.social_album]);

  useEffect(() => {
    if (!onboardingMode) return;
    if (formData.location_country) return;

    const fallbackFromPhone = () => {
      const phoneCountry = inferCountryCodeFromPhone(formData.phone || signupData.phone || "");
      if (phoneCountry) {
        const label = countryOptions.find((country) => country.code === phoneCountry)?.label || "";
        if (label) {
          setSelectedCountry(phoneCountry);
          setFormData((prev) => ({
            ...prev,
            location_country: label,
            location_name: `${prev.location_district || ""}${label ? `, ${label}` : ""}`.trim(),
          }));
          return true;
        }
      }
      return false;
    };

    if (navigator.geolocation) {
      const runGeoLookup = () => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${pos.coords.longitude},${pos.coords.latitude}.json?language=en&access_token=${MAPBOX_ACCESS_TOKEN}`;
              const res = await fetch(url);
              const payload = await res.json();
              const placeName = String(payload?.features?.[0]?.place_name || "");
              const parts = placeName.split(",").map((part: string) => part.trim()).filter(Boolean);
              const countryName = parts.at(-1) || "";
              if (countryName) {
                const code = countryOptions.find((country) => country.label.toLowerCase() === countryName.toLowerCase())?.code || "";
                if (code) setSelectedCountry(code);
                setFormData((prev) => ({
                  ...prev,
                  location_country: countryName,
                  location_name: `${prev.location_district || ""}${countryName ? `, ${countryName}` : ""}`.trim(),
                }));
                return;
              }
              fallbackFromPhone();
            } catch {
              fallbackFromPhone();
            }
          },
          () => {
            fallbackFromPhone();
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      };

      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: "geolocation" as PermissionName })
          .then((status) => {
            if (status.state === "granted") {
              runGeoLookup();
              return;
            }
            fallbackFromPhone();
          })
          .catch(() => fallbackFromPhone());
      } else {
        fallbackFromPhone();
      }
      return;
    }

    fallbackFromPhone();
  }, [onboardingMode, formData.location_country, formData.phone, signupData.phone]);

  useEffect(() => {
    const current = (formData.social_id || "").trim();
    const original = (profile?.social_id || "").trim();
    if (!socialIdEditMode) return;
    if (!current) {
      setSocialIdStatus("idle");
      setFieldErrors((prev) => ({ ...prev, social_id: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (!/^[a-z0-9._]{6,15}$/.test(current)) {
      setSocialIdStatus("idle");
      setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID must be 6-15 characters") }));
      return;
    }
    if (current.toLowerCase() === original.toLowerCase()) {
      setSocialIdStatus("available");
      setFieldErrors((prev) => ({ ...prev, social_id: "" }));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSocialIdStatus("checking");
      try {
        const { data: isTaken, error } = await supabase.rpc("is_social_id_taken", { p_social_id: current.toLowerCase() });
        if (cancelled) return;
        if (error) {
          setSocialIdStatus("failed");
          setFieldErrors((prev) => ({ ...prev, social_id: "Oops! We couldn’t check Social ID. Try again." }));
          return;
        }
        if (isTaken) {
          setSocialIdStatus("taken");
          setFieldErrors((prev) => ({ ...prev, social_id: "Oops! This Social ID was taken." }));
          return;
        }
        setSocialIdStatus("available");
        setFieldErrors((prev) => ({ ...prev, social_id: "" }));
      } catch {
        if (cancelled) return;
        setSocialIdStatus("failed");
        setFieldErrors((prev) => ({ ...prev, social_id: "Oops! We couldn’t check Social ID. Try again." }));
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.social_id, profile?.social_id, socialIdEditMode, t]);

  useEffect(() => {
    if (!locationQuery.trim() || locationQuery.trim().length < 2) {
      setLocationSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const countryFilter = selectedCountry ? `&country=${selectedCountry.toLowerCase()}` : "";
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationQuery.trim())}.json?autocomplete=true&limit=5&language=en${countryFilter}&access_token=${MAPBOX_ACCESS_TOKEN}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("geocode_failed");
        const data = await res.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        setLocationSuggestions(
          features
            .map((feature: { place_name?: string; center?: [number, number] }) => {
              const label = feature.place_name || "";
              return {
                label,
                lng: feature.center?.[0] ?? 0,
                lat: feature.center?.[1] ?? 0,
                district: extractDistrictFromPlaceLabel(label),
                country: extractCountryFromPlaceLabel(label),
              };
            })
            .filter((item: { label: string }) => Boolean(item.label))
        );
      } catch {
        setLocationSuggestions([]);
      } finally {
        setLocationLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locationQuery, selectedCountry]);

  // Debounced phone duplicate check for the edit-phone flow.
  // Only fires when: user is editing (phoneEditMode), the new number differs from the
  // saved value (skip own number), and the format is country-valid (skip garbage input).
  // Passes p_email:"" so the RPC only matches on phone — no false-positive on own email.
  // NOT OTP ownership verification — only uniqueness across auth.users.phone.
  useEffect(() => {
    const phone = formData.phone.trim();
    if (!phoneEditMode || phone === phoneOriginalValue.trim() || !isValidPhoneNumber(phone)) {
      setPhoneDuplicate(false);
      setPhoneDuplicateChecking(false);
      return;
    }
    const checkId = ++phoneDuplicateCheckRef.current;
    const timer = setTimeout(async () => {
      setPhoneDuplicateChecking(true);
      try {
        const { data, error } = await supabase.rpc("check_identifier_registered", {
          p_email: "",   // empty — skip email check; target phone uniqueness only
          p_phone: phone,
        });
        if (checkId !== phoneDuplicateCheckRef.current) return;
        setPhoneDuplicate(!error && Boolean(data?.registered));
      } catch {
        if (checkId !== phoneDuplicateCheckRef.current) return;
        setPhoneDuplicate(false);
      } finally {
        if (checkId === phoneDuplicateCheckRef.current) setPhoneDuplicateChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.phone, phoneEditMode, phoneOriginalValue]);

  const handleSocialAlbumUpload = async (file: File) => {
    const uploadId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setPendingSocialUploads((prev) => [
      ...prev,
      { id: uploadId, previewUrl, progress: 8, status: "uploading" },
    ]);

    if (!user) {
      const localReadPromise = new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const ratio = event.total > 0 ? event.loaded / event.total : 0;
          const progress = Math.max(8, Math.min(95, Math.round(ratio * 100)));
          setPendingSocialUploads((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, progress } : item)),
          );
        };
        reader.onerror = () => {
          setPendingSocialUploads((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, status: "error", progress: 0 } : item)),
          );
          resolve(null);
        };
        reader.onloadend = () => {
          const encoded = String(reader.result || "");
          if (!encoded) {
            setPendingSocialUploads((prev) =>
              prev.map((item) => (item.id === uploadId ? { ...item, status: "error", progress: 0 } : item)),
            );
            resolve(null);
            return;
          }
          setFormData((prev) => ({
            ...prev,
            social_album: canonicalizeSocialAlbumEntries([...prev.social_album, encoded]).slice(0, 5),
          }));
          resolve(encoded);
        };
        reader.readAsDataURL(file);
      }).finally(() => {
        window.setTimeout(() => {
          URL.revokeObjectURL(previewUrl);
          setPendingSocialUploads((prev) => prev.filter((item) => item.id !== uploadId));
          pendingSocialUploadRefs.current.delete(uploadId);
        }, 0);
      });
      pendingSocialUploadRefs.current.set(uploadId, localReadPromise);
      return;
    }

    const uploadPromise = (async () => {
      let keepPreviewForResolvedImage = false;
      let removePendingDelayMs = 1000;
      const tick = window.setInterval(() => {
        setPendingSocialUploads((prev) =>
          prev.map((item) =>
            item.id === uploadId && item.status === "uploading"
              ? { ...item, progress: Math.min(item.progress + 7, 92) }
              : item,
          ),
        );
      }, 180);
      try {
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1600, useWebWorker: true };
        const compressed = await imageCompression(file, options);
        if (compressed.size > 500 * 1024) {
          toast.error(t("Image must be under 500KB"));
          setPendingSocialUploads((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, status: "error", progress: 0 } : item)),
          );
          return null;
        }
        const ext = compressed.name.split(".").pop() || "jpg";
        const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("social_album").upload(filePath, compressed, { upsert: false });
        if (uploadError) throw uploadError;
        const nextAlbum = canonicalizeSocialAlbumEntries([...socialAlbumRef.current, filePath]).slice(0, 5);
        socialAlbumRef.current = nextAlbum;
        setFormData((prev) => ({ ...prev, social_album: nextAlbum }));
        setSocialAlbumLoadErrors((prev) => {
          if (!prev[filePath]) return prev;
          const next = { ...prev };
          delete next[filePath];
          return next;
        });
        setSocialAlbumFallbackPreviews((prev) => ({ ...prev, [filePath]: previewUrl }));
        keepPreviewForResolvedImage = true;
        removePendingDelayMs = 0;
        setPendingSocialUploads((prev) => prev.filter((item) => item.id !== uploadId));
        pendingSocialUploadRefs.current.delete(uploadId);
        const refreshed = await refreshSocialAlbumUrls(nextAlbum);
        if (refreshed[filePath]) {
          markAlbumUploadSuccess(filePath);
        } else {
          window.setTimeout(() => {
            void refreshSocialAlbumUrls(socialAlbumRef.current);
          }, 500);
        }
        return filePath;
      } catch (error) {
        const message = describeSupabaseWriteError(error);
        toast.error(message || t("Upload failed"));
        setPendingSocialUploads((prev) =>
          prev.map((item) => (item.id === uploadId ? { ...item, status: "error", progress: 0 } : item)),
        );
        return null;
      } finally {
        window.clearInterval(tick);
        window.setTimeout(() => {
          if (!keepPreviewForResolvedImage) {
            URL.revokeObjectURL(previewUrl);
          }
          setPendingSocialUploads((prev) => prev.filter((item) => item.id !== uploadId));
          pendingSocialUploadRefs.current.delete(uploadId);
        }, removePendingDelayMs);
      }
    })();
    pendingSocialUploadRefs.current.set(uploadId, uploadPromise);
  };

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("pets")
      .select("id, name, species, photo_url, is_active")
      .eq("owner_id", user.id)
      .then(({ data }) => {
        const activePets = (data || []).filter((pet) => pet.is_active !== false);
        const petCount = activePets.length;
        const hasPets = petCount > 0;
        setPetsProfileCount(petCount);
        setActivePetHeads(
          activePets.map((pet) => ({
            id: pet.id,
            name: pet.name,
            species: pet.species,
            photoUrl: pet.photo_url || null,
          }))
        );
        setFormData((prev) => ({
          ...prev,
          owns_pets: hasPets,
          non_social: false,
          availability_status: enforceAvailabilityDefaults(prev.availability_status, hasPets),
        }));
      });
  }, [user?.id]);

  useEffect(() => {
    if (formData.pet_experience.includes("None")) {
      setFormData((prev) => ({ ...prev, experience_years: "" }));
    }
  }, [formData.pet_experience]);

  // Refresh profile on window focus so email_verified updates if user verified
  // in another tab (e.g., clicked the link in their inbox).
  useEffect(() => {
    if (!onboardingMode) return;
    const onFocus = () => { void refreshProfile(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [onboardingMode, refreshProfile]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const localPreview = URL.createObjectURL(file);
      setPhotoPreview(localPreview);
      if (user?.id) {
        const uploadPromise = uploadProfilePhotoFile(file, user.id)
          .catch(() => null)
          .finally(() => {
            pendingPhotoUploadRef.current = null;
          });
        pendingPhotoUploadRef.current = uploadPromise;
      } else {
        const stopTicker = startUploadProgressTicker(setPhotoUploadState);
        const localReadPromise = new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const ratio = event.total > 0 ? event.loaded / event.total : 0;
            const progress = Math.max(8, Math.min(95, Math.round(ratio * 100)));
            setPhotoUploadState({ status: "uploading", progress });
          };
          reader.onerror = () => {
            setPhotoUploadState({ status: "error", progress: 0 });
            window.setTimeout(() => setPhotoUploadState({ status: "idle", progress: 0 }), 2200);
            resolve(null);
          };
          reader.onloadend = () => {
            const encoded = String(reader.result || "");
            if (!encoded) {
              setPhotoUploadState({ status: "error", progress: 0 });
              window.setTimeout(() => setPhotoUploadState({ status: "idle", progress: 0 }), 2200);
              resolve(null);
              return;
            }
            setPhotoPreview(encoded);
            setPhotoFile(null);
            setPhotoUploadState({ status: "success", progress: 100 });
            window.setTimeout(() => setPhotoUploadState({ status: "idle", progress: 0 }), 1400);
            resolve(encoded);
          };
          reader.readAsDataURL(file);
        }).finally(() => {
          stopTicker();
          URL.revokeObjectURL(localPreview);
          pendingPhotoUploadRef.current = null;
        });
        pendingPhotoUploadRef.current = localReadPromise;
      }
    }
  };

  const handleRemoveSocialAlbum = async (path: string) => {
    const next = canonicalizeSocialAlbumEntries(formData.social_album.filter((p) => p !== path));
    socialAlbumRef.current = next;
    setFormData((prev) => ({ ...prev, social_album: next }));
    setSocialAlbumUrls((prev) => {
      if (!prev[path]) return prev;
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
    setSocialAlbumLoadErrors((prev) => {
      if (!prev[path]) return prev;
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
    releaseSocialAlbumFallbackPreview(path);
    await refreshSocialAlbumUrls(next, { allowClear: next.length === 0 });
  };

  const requestPhoneOtp = async () => {
    if (!formData.phone.trim()) {
      setFieldErrors((prev) => ({ ...prev, phone: "Enter a valid phone number." }));
      return;
    }
    if (!isValidPhoneNumber(formData.phone.trim())) {
      // country-aware digit-count check — NOT OTP ownership
      setFieldErrors((prev) => ({ ...prev, phone: "Enter a valid phone number." }));
      return;
    }
    if (!isPhoneCountryAllowed(formData.phone.trim())) {
      setPhoneOtpUnavailable(true);
      setPhoneOtpRequested(false);
      setPhoneOtpMessage("Phone verification is not available yet.");
      return;
    }
    if (phoneDuplicate) {
      setFieldErrors((prev) => ({ ...prev, phone: t("This phone number is already used by another account") }));
      return;
    }
    const turnstileToken = phoneOtpTurnstile.getToken();
    if (!turnstileToken || !phoneOtpTurnstile.isTokenUsable) {
      toast.error("Please complete the verification first.");
      return;
    }
    setPhoneOtpUnavailable(false);
    setPhoneOtpMessage(null);
    const result = await requestPhoneOtpCode(formData.phone.trim(), turnstileToken);
    if (!result.ok) {
      setPhoneOtpUnavailable(Boolean(result.unavailable));
      setPhoneOtpMessage(result.error || "Phone verification is temporarily unavailable. Please try again later.");
      toast.error(result.error || "Phone verification is temporarily unavailable. Please try again later.");
      return;
    }
    setPhoneOtpRequested(true);
    setPhoneOtpVerified(false);
    setPhoneOtpUnavailable(false);
    setPhoneSentMaskedHint(maskPhoneForOtpNotice(formData.phone.trim()));
    setPhoneOtpMessage(`Verification request accepted for ${maskPhoneForOtpNotice(formData.phone.trim())}.`);
    if (otpCountdownRef.current) clearInterval(otpCountdownRef.current);
    setOtpCountdown(result.cooldownSeconds || 90);
    otpCountdownRef.current = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(otpCountdownRef.current!);
          otpCountdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    toast.success(`Verification request accepted for ${maskPhoneForOtpNotice(formData.phone.trim())}`);
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtpCode.trim()) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    const result = await verifyPhoneOtpCode(formData.phone.trim(), phoneOtpCode.trim());
    if (!result.ok) {
      toast.error(result.error || "We couldn’t verify the code right now. Please try again.");
      return;
    }
    await refreshProfile();
    setPhoneOtpVerified(true);
    setSavedPhoneVerified(true);
    setPhoneOtpRequested(false);
    setPhoneOtpCode("");
    setPhoneSentMaskedHint(null);
    setPhoneOtpMessage(null);
    setPhoneEditMode(false);
    if (otpCountdownRef.current) clearInterval(otpCountdownRef.current);
    setOtpCountdown(0);
    toast.success(t("Phone verified"));
  };

  const handlePhoneInlineSave = () => {
    const normalizedPhone = formData.phone.trim();
    if (!normalizedPhone) {
      setFieldErrors((prev) => ({ ...prev, phone: "Enter a valid phone number." }));
      return;
    }
    if (!isValidPhoneNumber(normalizedPhone)) {
      setFieldErrors((prev) => ({ ...prev, phone: t("Phone number length is not valid for the selected country") }));
      return;
    }
    if (phoneDuplicate) {
      setFieldErrors((prev) => ({ ...prev, phone: t("This phone number is already used by another account") }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, phone: "" }));
    setPhoneEditMode(false);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("Location services are unavailable. Please type your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocationCoords({ lat, lng });
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=en&access_token=${MAPBOX_ACCESS_TOKEN}`;
          const res = await fetch(url);
          const data = await res.json();
          const first = Array.isArray(data?.features) && data.features.length > 0 ? data.features[0] : null;
          if (first?.place_name) {
            const district = extractDistrictFromPlaceLabel(first.place_name);
            const country = extractCountryFromPlaceLabel(first.place_name);
            setLocationQuery(district);
            setResolvedLocationCountry(country || "");
            setFormData((prev) => ({
              ...prev,
              location_name: `${district}${country ? `, ${country}` : ""}`.trim(),
              location_district: district || prev.location_district,
              location_country: country || prev.location_country,
            }));
          }
        } catch {
          toast.error(t("Couldn’t resolve your current location. Please type manually."));
        }
      },
      () => {
        toast.error(t("Location permission denied. Please type your location manually."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const getPersistedPhoneValue = useCallback(() => {
    return formData.phone.trim() || null;
  }, [formData.phone]);

  const shouldRevokePhoneVerificationOnSave = useCallback(() => {
    const normalizedCurrentPhone = normalizePhoneForCompare(formData.phone);
    const normalizedOriginalPhone = normalizePhoneForCompare(phoneOriginalValue);
    const phoneChanged = normalizedCurrentPhone !== normalizedOriginalPhone;
    return phoneChanged && !phoneOtpVerified;
  }, [formData.phone, phoneOriginalValue, phoneOtpVerified]);

  const confirmPhoneVerificationReset = useCallback(() => {
    if (!savedPhoneVerified || !shouldRevokePhoneVerificationOnSave()) return true;
    return window.confirm(
      "Saving this new phone number will remove your verified phone status until you verify the new number. Continue?",
    );
  }, [savedPhoneVerified, shouldRevokePhoneVerificationOnSave]);

  const getCanonicalProfileEmail = useCallback(
    (authUser: { email?: string | null } | null | undefined) => {
      const authEmail = String(authUser?.email || "").trim().toLowerCase();
      if (authEmail) return authEmail;
      return String((profile as { email?: string | null } | null)?.email || "").trim().toLowerCase() || null;
    },
    [profile],
  );

  const readLegacySetProfileDraft = useCallback((): StoredFormDraft<ReturnType<typeof getProfileDraftValue>> | null => {
    if (!onboardingMode) return null;
    const prefillKey = resolveSetProfilePrefillKey();
    if (!prefillKey) return null;
    try {
      const raw = localStorage.getItem(prefillKey) || localStorage.getItem(SETPROFILE_PREFILL_KEY) || "{}";
      const cachedPrefill = JSON.parse(raw) as Record<string, unknown>;
      const draftRaw = cachedPrefill.form_data;
      const parsedDraft = draftRaw
        ? (typeof draftRaw === "string" ? JSON.parse(draftRaw) : draftRaw)
        : null;
      if (!parsedDraft || typeof parsedDraft !== "object") return null;
      const draft = parsedDraft as typeof formData;
      return {
        version: 1,
        form: {
          ...getProfileDraftValue(draft),
          avatar_url: typeof cachedPrefill.avatar_url === "string" && isPersistableImageUrl(cachedPrefill.avatar_url)
            ? cachedPrefill.avatar_url
            : "",
        },
        draft_updated_at: String(cachedPrefill.updated_at || new Date().toISOString()),
        baseline_updated_at: null,
        baseline_hash: null,
      };
    } catch {
      return null;
    }
  }, [getProfileDraftValue, onboardingMode, resolveSetProfilePrefillKey]);

  const profileDraftAutosave = useFormDraftAutosave({
    draftKey: resolveProfileDraftKey(),
    enabled: Boolean(resolveProfileDraftKey()),
    mode: profileDraftMode,
    value: formData,
    setValue: setFormData,
    getDraftValue: getProfileDraftValue,
    debounceMs: 1000,
    saveRemote: async ({ changedFields, draft }) => {
      if (profileDraftMode !== "local-and-remote" || !user?.id) return;
      const payload: Record<string, unknown> = {
        id: user.id,
        updated_at: new Date().toISOString(),
      };
      const fieldSet = new Set(changedFields as string[]);
      const hasPets = petsProfileCount > 0 || draft.owns_pets;
      const persistedPhone = String(draft.phone || "").trim() || null;
      const shouldRevokePhoneVerification =
        normalizePhoneForCompare(draft.phone) !== normalizePhoneForCompare(phoneOriginalValue) &&
        !phoneOtpVerified;

      if (fieldSet.has("display_name")) payload.display_name = draft.display_name;
      if (fieldSet.has("legal_name")) payload.legal_name = draft.legal_name || null;
      if (fieldSet.has("phone")) {
        payload.phone = persistedPhone;
        if (shouldRevokePhoneVerification) {
          payload.phone_verification_status = "unverified";
          payload.phone_verified_at = null;
        }
      }
      if (fieldSet.has("dob")) payload.dob = draft.dob || null;
      if (fieldSet.has("bio")) payload.bio = draft.bio;
      if (fieldSet.has("social_id")) payload.social_id = draft.social_id || null;
      if (fieldSet.has("gender_genre")) payload.gender_genre = draft.gender_genre || null;
      if (fieldSet.has("orientation")) payload.orientation = draft.orientation || null;
      if (fieldSet.has("height")) payload.height = draft.height ? parseInt(draft.height, 10) : null;
      if (fieldSet.has("weight")) payload.weight = draft.weight ? parseFloat(draft.weight) : null;
      if (fieldSet.has("weight_unit")) payload.weight_unit = draft.weight_unit;
      if (fieldSet.has("degree")) payload.degree = draft.degree || null;
      if (fieldSet.has("school")) payload.school = draft.school || null;
      if (fieldSet.has("major")) payload.major = draft.major || null;
      if (fieldSet.has("affiliation")) payload.affiliation = draft.affiliation || null;
      if (fieldSet.has("occupation")) payload.occupation = draft.occupation || null;
      if (fieldSet.has("relationship_status")) payload.relationship_status = draft.relationship_status || null;
      if (fieldSet.has("has_car")) payload.has_car = draft.has_car;
      if (fieldSet.has("languages")) payload.languages = draft.languages.length > 0 ? draft.languages : null;
      if (fieldSet.has("location_name")) payload.location_name = draft.location_name || null;
      if (fieldSet.has("location_country")) payload.location_country = draft.location_country || null;
      if (fieldSet.has("location_district")) payload.location_district = draft.location_district || null;
      if (fieldSet.has("social_album")) payload.social_album = canonicalizeSocialAlbumEntries(draft.social_album);
      if (fieldSet.has("avatar_url")) payload.avatar_url = draft.avatar_url || null;
      if (fieldSet.has("pet_experience")) payload.pet_experience = draft.pet_experience.length > 0 ? draft.pet_experience : null;
      if (fieldSet.has("experience_years") || fieldSet.has("pet_experience")) {
        payload.experience_years =
          draft.pet_experience.includes("None") || !draft.experience_years
            ? null
            : parseFloat(draft.experience_years);
      }
      if (fieldSet.has("owns_pets")) payload.owns_pets = petsProfileCount > 0 ? true : draft.owns_pets;
      if (fieldSet.has("availability_status") || fieldSet.has("owns_pets")) {
        payload.non_social = draft.availability_status.length === 0;
        payload.availability_status = enforceAvailabilityDefaults(draft.availability_status, hasPets);
      }
      if (fieldSet.has("show_gender")) payload.show_gender = draft.show_gender;
      if (fieldSet.has("show_orientation")) payload.show_orientation = draft.show_orientation;
      if (fieldSet.has("show_age")) payload.show_age = draft.show_age;
      if (fieldSet.has("show_height")) payload.show_height = draft.show_height;
      if (fieldSet.has("show_weight")) payload.show_weight = draft.show_weight;
      if (fieldSet.has("show_academic")) payload.show_academic = draft.show_academic;
      if (fieldSet.has("show_affiliation")) payload.show_affiliation = draft.show_affiliation;
      if (fieldSet.has("show_occupation")) payload.show_occupation = draft.show_occupation;
      if (fieldSet.has("show_bio")) payload.show_bio = draft.show_bio;
      if (fieldSet.has("show_relationship_status")) payload.show_relationship_status = draft.show_relationship_status;
      if (fieldSet.has("show_languages") || fieldSet.has("show_location")) {
        payload.prefs = {
          ...((profile?.prefs as Record<string, unknown> | null) || {}),
          show_languages: draft.show_languages,
          show_location: draft.show_location,
        };
      }
      payload.email = getCanonicalProfileEmail(user);

      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("updated_at")
        .single();
      if (error) throw error;
      return {
        baselineUpdatedAt: String((data as { updated_at?: string } | null)?.updated_at || new Date().toISOString()),
      };
    },
  });
  const {
    status: profileDraftStatus,
    hydrateFromBaseline: hydrateProfileDraftFromBaseline,
    flushLocalDraftNow: flushProfileLocalDraftNow,
    flushRemoteNow: flushProfileRemoteDraftNow,
    discardDraft: discardProfileDraft,
    commitLatestDraftAsBaseline: commitProfileDraftAsBaseline,
  } = profileDraftAutosave;

  // ── Silent draft save (View tab) ────────────────────────────────────────────
  const silentSave = async () => {
    flushProfileLocalDraftNow();
    if (profileDraftMode === "local-and-remote") {
      await flushProfileRemoteDraftNow();
    }
  };

  const handleSave = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const activeUser = user ?? sessionData.session?.user ?? null;
    const missingFields = getMissingRequiredFieldLabels();
    if (missingFields.length > 0) {
      validateRequiredFields();
      focusFirstMissingRequiredField(missingFields);
      toast.error(formatMissingFieldsToast(missingFields));
      return;
    }

    if (!activeUser) {
      if (!onboardingMode) {
        toast.error("Please sign in to continue.");
        navigate("/auth");
        return;
      }
      // Account creation/sign-in is now protected by Turnstile-backed wrapper routes.
      // If onboarding reaches this page without an authenticated session, route the
      // user back to the credential/signup step to complete the protected flow.
      const email = (signupData.email || "").trim();
      if (email) {
        toast.error("Please complete account verification, then continue.");
        navigate("/signup/credentials");
        return;
      }
      toast.error("Please sign in to continue.");
      navigate("/auth");
      return;
    }

    if (!formData.display_name.trim()) {
      setFieldErrors((prev) => ({ ...prev, displayName: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (!formData.phone.trim()) {
      setFieldErrors((prev) => ({ ...prev, phone: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (!isValidPhoneNumber(formData.phone.trim())) {
      // country-aware digit-count check — NOT OTP ownership
      setFieldErrors((prev) => ({
        ...prev,
        phone: t("Phone number length is not valid for the selected country"),
      }));
      return;
    }
    if (phoneDuplicate) {
      setFieldErrors((prev) => ({ ...prev, phone: t("This phone number is already used by another account") }));
      return;
    }
    const currentPhoneNormalized = normalizePhoneForCompare(formData.phone);
    const originalPhoneNormalized = normalizePhoneForCompare(phoneOriginalValue);
    const phoneChanged = currentPhoneNormalized !== originalPhoneNormalized;
    if (phoneChanged && !phoneOtpVerified && !confirmPhoneVerificationReset()) {
      setPhoneEditMode(true);
      return;
    }
    if (!formData.social_id.trim()) {
      setFieldErrors((prev) => ({ ...prev, social_id: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (formData.social_id.trim().length < 6 || formData.social_id.trim().length > 15) {
      setFieldErrors((prev) => ({ ...prev, social_id: t("Social ID must be 6-15 characters") }));
      return;
    }
    if (!/^[a-z0-9._]+$/.test(formData.social_id.trim())) {
      setFieldErrors((prev) => ({ ...prev, social_id: t("Only lowercase letters, numbers, dot, underscore") }));
      return;
    }
    if (socialIdEditMode && socialIdStatus !== "available" && formData.social_id.trim().toLowerCase() !== (profile?.social_id || "").trim().toLowerCase()) {
      setFieldErrors((prev) => ({ ...prev, social_id: t("Please use an available Social ID before saving") }));
      return;
    }
    if (!formData.dob) {
      setFieldErrors((prev) => ({ ...prev, dob: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (!isAtLeast13FromDate(formData.dob)) {
      setFieldErrors((prev) => ({ ...prev, dob: "You must be at least 13 years old to use Huddle." }));
      return;
    }
    if (!formData.gender_genre.trim()) {
      setFieldErrors((prev) => ({ ...prev, gender: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (!formData.location_country.trim() || !formData.location_district.trim()) {
      setFieldErrors((prev) => ({ ...prev, location: REQUIRED_CONNECT_ERROR }));
      return;
    }
    const locationCountryFromAddress = resolvedLocationCountry || extractCountryFromPlaceLabel(formData.location_name || locationQuery);
    if (
      locationCountryFromAddress &&
      formData.location_country &&
      locationCountryFromAddress.trim().toLowerCase() !== formData.location_country.trim().toLowerCase()
    ) {
      setFieldErrors((prev) => ({ ...prev, location: "Country must match your location" }));
      return;
    }
    if (formData.pet_experience.length === 0) {
      setFieldErrors((prev) => ({ ...prev, petExperience: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (formData.availability_status.length === 0) {
      setFieldErrors((prev) => ({ ...prev, socialAvailability: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (formData.height && (!NUMERIC_ONLY_REGEX.test(formData.height) || Number(formData.height) > 300)) {
      setFieldErrors((prev) => ({ ...prev, height: t("Height must be a number up to 300") }));
      return;
    }
    if (formData.weight && (!DECIMAL_NUMBER_REGEX.test(formData.weight) || Number(formData.weight) > 700)) {
      setFieldErrors((prev) => ({ ...prev, weight: t("Weight must be a number up to 700") }));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.school.trim()) && formData.school.trim().length > 0) {
      setFieldErrors((prev) => ({ ...prev, school: t("School cannot be numbers only") }));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.major.trim()) && formData.major.trim().length > 0) {
      setFieldErrors((prev) => ({ ...prev, major: t("Major cannot be numbers only") }));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.occupation.trim()) && formData.occupation.trim().length > 0) {
      setFieldErrors((prev) => ({ ...prev, occupation: t("Occupation cannot be numbers only") }));
      return;
    }
    const hasPets = petsProfileCount > 0 || formData.owns_pets;
    if (hasPets && (formData.pet_experience.length === 0 || formData.pet_experience.includes("None"))) {
      setFieldErrors((prev) => ({ ...prev, petExperience: REQUIRED_CONNECT_ERROR }));
      return;
    }
    if (formData.pet_experience.length > 0 && !formData.pet_experience.includes("None")) {
      const years = Number(formData.experience_years);
      const validYears =
        Number.isFinite(years) &&
        years >= 0 &&
        years <= 99;
      if (!formData.experience_years || !validYears) {
        setFieldErrors((prev) => ({ ...prev, experienceYears: EXPERIENCE_YEARS_ERROR }));
        return;
      }
    }

    setLoading(true);

    try {
      await waitForMediaUploads();

      let avatarUrl = photoPreview || profile?.avatar_url;
      if (pendingPhotoUploadRef.current) {
        avatarUrl = await pendingPhotoUploadRef.current;
      } else if (photoFile) {
        avatarUrl = await uploadProfilePhotoFile(photoFile, activeUser.id);
      }
      const isOAuthUser = (activeUser.app_metadata?.provider ?? "email") !== "email";
      const emailVerifiedByAuth = isOAuthUser || Boolean(activeUser.email_confirmed_at);
      const persistedPhone = getPersistedPhoneValue();
      const shouldRevokePhoneVerification = shouldRevokePhoneVerificationOnSave();

      const profilePayload = {
          email: getCanonicalProfileEmail(activeUser),
          display_name: formData.display_name,
          phone: persistedPhone,
          social_id: formData.social_id || null,
          bio: formData.bio,
          gender_genre: formData.gender_genre || null,
          orientation: formData.orientation || null,
          dob: formData.dob || null,
          height: formData.height ? parseInt(formData.height) : null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
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
          location_country: formData.location_country || null,
          location_district: formData.location_district || null,
          last_lat: locationCoords?.lat ?? (profile?.last_lat ?? null),
          last_lng: locationCoords?.lng ?? (profile?.last_lng ?? null),
          pet_experience: formData.pet_experience.length > 0 ? formData.pet_experience : null,
          experience_years:
            formData.pet_experience.includes("None") || !formData.experience_years
              ? null
              : parseFloat(formData.experience_years),
          owns_pets: petsProfileCount > 0 ? true : formData.owns_pets,
          non_social: formData.availability_status.length === 0,
          availability_status:
            petsProfileCount > 0
              ? enforceAvailabilityDefaults(formData.availability_status, true)
              : enforceAvailabilityDefaults(formData.availability_status, formData.owns_pets),
          show_gender: formData.show_gender,
          show_orientation: formData.show_orientation,
          show_age: true,
          show_height: formData.show_height,
          show_weight: formData.show_weight,
          show_academic: formData.show_academic,
          show_affiliation: formData.show_affiliation,
          show_occupation: formData.show_occupation,
          show_bio: formData.show_bio,
          show_relationship_status: formData.show_relationship_status,
          prefs: {
            ...((profile?.prefs as Record<string, unknown> | null) || {}),
            show_languages: formData.show_languages,
            show_location: formData.show_location,
          },
          social_album: canonicalizeSocialAlbumEntries(formData.social_album),
          avatar_url: avatarUrl,
          ...(shouldRevokePhoneVerification
            ? {
                phone_verification_status: "unverified" as const,
                phone_verified_at: null,
              }
            : {}),
          updated_at: new Date().toISOString(),
      };

      let profileWrite = await supabase
        .from("profiles")
        .upsert(
          {
            id: activeUser.id,
            ...profilePayload,
            onboarding_completed: onboardingMode ? true : profile?.onboarding_completed ?? false,
            email_verified: onboardingMode ? emailVerifiedByAuth : profile?.email_verified ?? emailVerifiedByAuth,
          },
          { onConflict: "id" },
        )
        .select("updated_at");

      if (
        profileWrite.error?.code === "PGRST204" &&
        String(profileWrite.error.message || "").toLowerCase().includes("social_id")
      ) {
        const { social_id: _socialId, ...payloadWithoutSocialId } = profilePayload;
        profileWrite = await supabase
          .from("profiles")
          .upsert(
            {
              id: activeUser.id,
              ...payloadWithoutSocialId,
              onboarding_completed: onboardingMode ? true : profile?.onboarding_completed ?? false,
              email_verified: onboardingMode ? emailVerifiedByAuth : profile?.email_verified ?? emailVerifiedByAuth,
            },
            { onConflict: "id" },
          )
          .select("updated_at");
        if (!profileWrite.error) toast.info(PROFILE_WRITE_SCHEMA_DRIFT_ERROR);
      }

      const error = profileWrite.error;

      if (error) throw error;

      if (phoneChanged) {
        const { error: refreshPhoneStatusError } = await supabase.rpc(
          "refresh_phone_verification_status",
          { p_user_id: activeUser.id },
        );
        if (refreshPhoneStatusError) {
          console.warn("[EditProfile] refresh_phone_verification_status failed:", refreshPhoneStatusError.message);
        }

        const { error: refreshIdentityStatusError } = await supabase.rpc(
          "refresh_identity_verification_status",
          { p_user_id: activeUser.id },
        );
        if (refreshIdentityStatusError) {
          console.warn("[EditProfile] refresh_identity_verification_status failed:", refreshIdentityStatusError.message);
        }

        const nextPhoneVerified = shouldRevokePhoneVerification ? false : phoneOtpVerified;
        setSavedPhoneVerified(nextPhoneVerified);
        setPhoneOtpVerified(nextPhoneVerified);
        setPhoneOriginalValue((getPersistedPhoneValue() || "").trim());
        setPhoneOtpRequested(false);
        setPhoneOtpCode("");
        setPhoneSentMaskedHint(null);
        setPhoneOtpMessage(
          shouldRevokePhoneVerification
            ? "Phone number saved. Verify this number to restore phone verification."
            : null,
        );
      }

      if (onboardingMode) {
        await finalizePendingVerification(activeUser.id);

        // Back-fill verification statuses: the edge-function UPDATE was a no-op
        // because the profile row didn't exist at verification time.
        // Now that the row exists, reconcile from the attempt tables.
        const { data: passedHumanAttempt } = await supabase
          .from("human_verification_attempts")
          .select("created_at")
          .eq("user_id", activeUser.id)
          .eq("status", "passed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (passedHumanAttempt) {
          await supabase
            .from("profiles")
            .update({
              human_verification_status: "passed",
              human_verified_at: passedHumanAttempt.created_at,
              is_verified: true,
              verification_status: "verified",
            })
            .eq("id", activeUser.id);
        }

        // Sync card / overall verification_status via RPC
        const { error: syncError } = await supabase.rpc(
          "refresh_identity_verification_status",
          { p_user_id: activeUser.id },
        );
        if (syncError) console.warn("[EditProfile] Failed to sync verification status:", syncError.message);
      }

      await refreshProfile();
      if (avatarUrl && isPersistableImageUrl(avatarUrl)) {
        setPhotoPreview(avatarUrl);
      }
      commitProfileDraftAsBaseline(
        String((profileWrite.data?.[0] as { updated_at?: string } | undefined)?.updated_at || new Date().toISOString()),
        {
          ...getProfileDraftValue(formData),
          avatar_url: avatarUrl && isPersistableImageUrl(avatarUrl) ? avatarUrl : "",
        },
      );
      try {
        const prefillKey = resolveSetProfilePrefillKey();
        if (prefillKey) {
          localStorage.removeItem(prefillKey);
        }
      } catch {
        // no-op
      }
      if (onboardingMode) {
        resetSignup();
        clearOnboardingDraftKeys(activeUser.id);
      }
      // Welcome email — fire once on onboarding completion
      if (onboardingMode) {
        void supabase.functions.invoke("send-welcome-email", {
          body: { user_id: activeUser.id },
        }).catch((err) => console.warn("[send-welcome-email] failed silently", err));
      }
      if (!onboardingMode) {
        toast.success(t("Profile updated!"));
      }
      if (onboardingMode) {
        const shouldSetPet = petsProfileCount > 0 || formData.owns_pets === true;
        toast.success("Profile completed successfully.");
        navigate(shouldSetPet ? "/set-pet" : "/", {
          state: shouldSetPet ? null : { fromSetProfileNoPet: true },
          replace: !shouldSetPet,
        });
      } else {
        // Stay on Edit Profile after save (no auto-navigation bounce).
      }
    } catch (error: unknown) {
      const message = describeSupabaseWriteError(error);
      console.error("[EditProfile.save_failed]", error);
      toast.error(humanizeNumericDbError(message || t("Failed to update profile")));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    flushProfileLocalDraftNow();
    if (profileDraftMode === "local-only") {
      toast.success("Draft saved");
      return;
    }
    setLoading(true);
    try {
      await flushProfileRemoteDraftNow();
      toast.success("Draft saved");
      await refreshProfile();
    } catch (err) {
      console.warn("[EditProfile.saveDraft]", err);
      toast.error("Could not save draft. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const mediaUploadInProgress =
    photoUploadState.status === "uploading" ||
    pendingSocialUploads.some((item) => item.status === "uploading");
  const phoneChangedFromOriginal =
    normalizePhoneForCompare(formData.phone) !== normalizePhoneForCompare(phoneOriginalValue);
  const showPhoneChangeVerifiedWarning =
    phoneEditMode && savedPhoneVerified && phoneChangedFromOriginal && !phoneOtpVerified;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <NeuControl
          size="icon-md"
          variant="tertiary"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        </NeuControl>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">Tell us about you</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Customize how you appear to the community</p>
        </div>
        {profileMode === "edit" ? (
          <NeuControl
            size="icon-md"
            variant="tertiary"
            onClick={handleSave}
            disabled={loading}
            aria-label={t("Save")}
          >
            {loading
              ? <Loader2 size={20} strokeWidth={1.75} className="animate-spin" aria-hidden />
              : <Save size={20} strokeWidth={1.75} aria-hidden />
            }
          </NeuControl>
        ) : <span className="inline-block w-10" aria-hidden />}
      </header>

      <div className="px-4 pt-2">
        <FormDraftStatus
          mode={profileDraftMode}
          status={profileDraftStatus}
          onDiscard={
            profileDraftMode === "local-and-remote"
              ? () => discardProfileDraft({ restoreBaseline: true })
              : undefined
          }
          onReload={
            profileDraftMode === "local-and-remote"
              ? () => {
                  discardProfileDraft({ restoreBaseline: false });
                  void refreshProfile();
                }
              : undefined
          }
        />
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

      {profileMode === "edit" ? (
      <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 pb-6" style={{ paddingBottom: keyboardOffset > 0 ? `${keyboardOffset + 24}px` : undefined }}>
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="relative w-28 h-28 rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt={t("Profile")}
                    className={cn(
                      "w-full h-full object-cover transition-all",
                      photoUploadState.status === "uploading" && "blur-[2px] opacity-70",
                    )}
                  />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
                {photoUploadState.status === "uploading" && (
                  <div className="absolute inset-0 rounded-full bg-black/35 flex flex-col items-center justify-center text-white text-xs font-semibold">
                    <span>{Math.round(photoUploadState.progress)}%</span>
                    <span className="text-[10px] font-medium mt-1">Uploading</span>
                  </div>
                )}
                {photoUploadState.status === "success" && (
                  <div className="absolute inset-0 rounded-full bg-emerald-600/35 flex items-center justify-center text-white">
                    <Check className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <Camera className="w-4 h-4 text-accent-foreground" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  width: "100%",
                  height: "100%",
                  cursor: "pointer",
                }}
              />
            </label>
          </div>

          {/* BASIC INFO */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Basic Info")}</h3>

            <div id="profile-field-legal-name">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Legal Name</label>
              <div className="form-field-rest relative flex items-center justify-between bg-[rgba(66,73,101,0.08)] text-muted-foreground">
                <span className="truncate">
                  {hasVerifiedLegalName ? (formData.legal_name || "—") : "Available after verification"}
                </span>
              </div>
            </div>

            {/* Display Name */}
            <div id="profile-field-display-name">
              <label className="text-sm font-medium mb-2 block">{t("Display/User Name")}</label>
              {!displayNameEditMode ? (
                <div className="form-field-rest relative flex items-center justify-between bg-[rgba(66,73,101,0.08)]">
                  <span className="truncate text-foreground/90">{formData.display_name || "—"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDisplayNameEditMode(true);
                      setSocialIdEditMode(false);
                      setPhoneEditMode(false);
                    }}
                    className="p-1 text-muted-foreground"
                    aria-label="Edit display name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="form-field-rest relative flex items-center bg-white">
                  <input
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        displayName: formData.display_name.trim() ? "" : REQUIRED_CONNECT_ERROR,
                      }))
                    }
                    placeholder={t("Your display name")}
                    className="field-input-core"
                    required
                    disabled={false}
                    aria-invalid={Boolean(fieldErrors.displayName)}
                  />
                </div>
              )}
              {fieldErrors.displayName && <ErrorLabel message={fieldErrors.displayName} />}
            </div>

            {/* Social ID */}
            <div id="profile-field-social-id">
              <label className="text-sm font-medium mb-2 block">{t("Social ID")}</label>
              {!socialIdEditMode ? (
                <div className="form-field-rest relative flex items-center justify-between bg-[rgba(66,73,101,0.08)]">
                  <span className="truncate text-foreground/90">@{formData.social_id || "—"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSocialIdEditMode(true);
                      setDisplayNameEditMode(false);
                      setPhoneEditMode(false);
                    }}
                    className="p-1 text-muted-foreground"
                    aria-label="Edit social ID"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="form-field-rest relative flex items-center bg-white">
                  <span className="absolute left-4 text-[15px] text-[var(--text-tertiary)] pointer-events-none">@</span>
                  <input
                    value={formData.social_id || ""}
                    onChange={(e) => {
                      // Strip anything the DB constraint rejects: only a-z 0-9 . _
                      const normalized = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "");
                      setFormData((prev) => ({ ...prev, social_id: normalized }));
                    }}
                    onBlur={() => {
                      if (!formData.social_id.trim()) {
                        setFieldErrors((prev) => ({ ...prev, social_id: REQUIRED_CONNECT_ERROR }));
                      }
                    }}
                    className="field-input-core pl-8"
                    disabled={false}
                    aria-invalid={Boolean(fieldErrors.social_id)}
                  />
                </div>
              )}
              {socialIdEditMode && !fieldErrors.social_id && socialIdStatus === "checking" && (
                <p className="text-xs text-muted-foreground mt-1">Checking Social ID…</p>
              )}
              {socialIdEditMode && !fieldErrors.social_id && socialIdStatus === "available" && (
                <p className="text-xs text-emerald-600 mt-1">Social ID is available</p>
              )}
              {fieldErrors.social_id && <ErrorLabel message={fieldErrors.social_id} />}
            </div>

            {/* ── Email field (read-only + verification badge) ── */}
            {onboardingMode && (
              <div className="flex flex-col" style={{ gap: "var(--field-gap-lc, 6px)" }}>
                <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">
                  Email
                </label>
                <div className="form-field-rest relative flex items-center justify-between px-4 bg-[rgba(66,73,101,0.08)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    <span className="text-[15px] text-[var(--text-primary,#424965)] truncate">
                      {user?.email ?? profile?.email ?? "—"}
                    </span>
                  </div>

                  <span className="neu-chip text-[11px] font-semibold text-[rgba(74,73,101,0.45)] shrink-0 ml-2">
                    Verified
                  </span>
                </div>
              </div>
            )}

            {/* Phone */}
            <div id="profile-field-phone">
              <label className="text-sm font-medium mb-2 block">{t("Phone")}</label>
              {!phoneEditMode ? (
                <div className="form-field-rest relative flex items-center justify-between bg-[rgba(66,73,101,0.08)]">
                  <span className="truncate text-foreground/90">{formData.phone || "—"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDisplayNameEditMode(false);
                      setSocialIdEditMode(false);
                      setPhoneEditMode(true);
                      setPhoneOtpRequested(false);
                      setPhoneOtpVerified(savedPhoneVerified);
                      setPhoneOtpCode("");
                      setPhoneOtpUnavailable(false);
                      setPhoneOtpMessage(savedPhoneVerified ? null : "Changing your phone number will require a new code.");
                      setPhoneSentMaskedHint(null);
                    }}
                    className="p-1 text-muted-foreground"
                    aria-label="Edit phone"
                  >
                    {savedPhoneVerified ? <Check className="w-4 h-4 text-brandBlue" /> : <Pencil className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={cn("form-field-rest relative flex items-center bg-white pr-[132px]", fieldErrors.phone && "form-field-error")}>
                    <PhoneInput
                      international
                      defaultCountry={(inferCountryCodeFromPhone(formData.phone) || "HK") as never}
                      value={formData.phone}
                      onChange={(value) => {
                        const v = value || "";
                        setFormData((prev) => ({ ...prev, phone: v }));
                        const unchanged = normalizePhoneForCompare(v) === normalizePhoneForCompare(phoneOriginalValue);
                        setPhoneOtpVerified(unchanged ? savedPhoneVerified : false);
                        if (!unchanged) {
                          setPhoneOtpRequested(false);
                          setPhoneOtpCode("");
                          setPhoneSentMaskedHint(null);
                          setPhoneOtpUnavailable(false);
                        } else {
                          setPhoneOtpMessage(null);
                        }
                      }}
                      className="w-full [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none [&_.PhoneInputInput]:text-[15px] [&_.PhoneInputInput]:text-[var(--text-primary,#424965)]"
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {phoneChangedFromOriginal && (
                        <button
                          type="button"
                          onClick={requestPhoneOtp}
                          disabled={
                            phoneOtpUnavailable ||
                            otpCountdown > 0 ||
                            !phoneOtpTurnstile.isTokenUsable ||
                            phoneDuplicate ||
                            phoneDuplicateChecking ||
                            (Boolean(formData.phone) && !isValidPhoneNumber(formData.phone))
                          }
                          className={cn(
                            "h-7 px-2 rounded-[8px] text-[11px] font-semibold transition-colors shrink-0",
                            (phoneOtpUnavailable ||
                              otpCountdown > 0 ||
                              !phoneOtpTurnstile.isTokenUsable ||
                              phoneDuplicate ||
                              phoneDuplicateChecking ||
                              (Boolean(formData.phone) && !isValidPhoneNumber(formData.phone)))
                              ? "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                              : "bg-brandBlue text-white active:opacity-80"
                          )}
                        >
                          {otpCountdown > 0 ? `Resend ${otpCountdown}s` : "Send OTP"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handlePhoneInlineSave}
                        className="h-7 w-7 rounded-[8px] border border-[rgba(163,168,190,0.28)] bg-white text-[var(--text-secondary)] grid place-items-center"
                        aria-label="Save phone edit"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {showPhoneChangeVerifiedWarning && (
                    <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1">
                      Changing your number without verifying it will remove your verified status.
                    </p>
                  )}
                  {phoneDuplicate && (
                    <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                      This phone number is already used by another account
                    </p>
                  )}
                  {phoneChangedFromOriginal && !phoneOtpUnavailable ? (
                    <>
                      <TurnstileWidget
                        siteKeyMissing={phoneOtpTurnstile.siteKeyMissing}
                        setContainer={phoneOtpTurnstile.setContainer}
                        className="min-h-[65px]"
                      />
                      <p className="text-[12px] text-[var(--text-tertiary)] pl-1">
                        Standard SMS rates may apply.
                      </p>
                      {phoneOtpTurnstile.diag.widgetRendered && phoneOtpTurnstile.error ? (
                        <p className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1" aria-live="polite">
                          {phoneOtpTurnstile.error}
                        </p>
                      ) : null}
                      <TurnstileDebugPanel visible={showTurnstileDiag} diag={phoneOtpTurnstile.diag} />
                    </>
                  ) : phoneChangedFromOriginal ? (
                    <div className="rounded-[10px] border border-[rgba(163,168,190,0.28)] bg-[rgba(163,168,190,0.12)] px-3 py-2">
                      <p className="text-[12px] font-semibold text-[var(--text-tertiary)]">Unavailable</p>
                    </div>
                  ) : null}
                  {phoneOtpMessage ? (
                    <p className={cn(
                      "text-[12px] font-medium pl-1",
                      phoneOtpUnavailable
                        ? "text-[var(--text-tertiary)]"
                        : "text-[var(--text-secondary)]",
                    )}>
                      {phoneOtpMessage}
                    </p>
                  ) : null}
                  {phoneOtpRequested && phoneSentMaskedHint ? (
                    <p className="text-[12px] text-[var(--text-tertiary)] pl-1">
                      Code sent to {phoneSentMaskedHint}
                    </p>
                  ) : null}
                  {phoneChangedFromOriginal && !phoneOtpVerified && phoneOtpRequested && (
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-[var(--text-secondary)]">Verification code</p>
                      <div className="relative flex items-center">
                        <input
                          value={phoneOtpCode}
                          onChange={(e) => setPhoneOtpCode(e.target.value.replace(/[^\d]/g, ""))}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          className="w-full h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white pl-3 pr-[90px] text-[15px] text-[var(--text-primary,#424965)] outline-none focus:border-brandBlue tracking-[0.2em]"
                          maxLength={6}
                          placeholder="6-digit code"
                        />
                        <button
                          type="button"
                          onClick={verifyPhoneOtp}
                          disabled={phoneOtpCode.length < 6}
                          className={cn(
                            "absolute right-2 h-[30px] px-3 rounded-[8px] text-[12px] font-semibold transition-colors shrink-0",
                            phoneOtpCode.length >= 6
                              ? "bg-brandBlue text-white active:opacity-80"
                              : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                          )}
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            {fieldErrors.phone && <ErrorLabel message={fieldErrors.phone} />}
          </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,170px)] gap-3 items-start">
              <div id="profile-field-dob">
                <div className="flex items-center justify-between mb-2 h-6">
                  <label className="text-sm font-medium">{t("Date of Birth")}</label>
                  <span className="inline-block w-[52px]" aria-hidden />
                </div>
                {!dobEditMode ? (
                  <div className="form-field-rest relative flex items-center justify-between bg-[rgba(66,73,101,0.08)]">
                    <span className="truncate text-foreground/90">{formData.dob || "—"}</span>
                    <button
                      type="button"
                      onClick={() => setDobEditMode(true)}
                      className="p-1 text-muted-foreground"
                      aria-label="Edit date of birth"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="form-field-rest relative flex items-center bg-white">
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                      onBlur={() => {
                        if (!formData.dob) return;
                        const dob = new Date(formData.dob);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const under13 = !isAtLeast13FromDate(formData.dob);
                        setFieldErrors((prev) => ({
                          ...prev,
                          dob: dob > today
                            ? t("Human DOB cannot be in the future")
                            : under13
                            ? "You must be at least 13 years old to use Huddle."
                            : "",
                        }));
                        setDobEditMode(false);
                      }}
                      className="field-input-core pr-10 huddle-date-input"
                      required
                      aria-invalid={Boolean(fieldErrors.dob)}
                    />
                  </div>
                )}
                {fieldErrors.dob && (
                  <ErrorLabel message={fieldErrors.dob} />
                )}
                {!fieldErrors.dob && showDiscoverAgeInfo && (
                  <p className="mt-2 text-xs text-[rgba(74,73,101,0.55)]">
                    You must be 16+ to access Discover feature on Chats.
                  </p>
                )}
              </div>
              <div id="profile-field-height">
                <div className="flex items-center justify-between mb-2 h-6">
                  <label className="text-sm font-medium">Height</label>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                    <NeuToggle
                      checked={formData.show_height}
                      onCheckedChange={(checked) => handleVisibilityToggle("show_height", checked)}
                    />
                  </div>
                </div>
                <div className="form-field-rest relative flex items-center">
                  <input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                    onBlur={() => {
                      if (!formData.height) {
                        setFieldErrors((prev) => ({ ...prev, height: "" }));
                        return;
                      }
                      const valid = NUMERIC_ONLY_REGEX.test(formData.height) && Number(formData.height) <= 300;
                      setFieldErrors((prev) => ({ ...prev, height: valid ? "" : t("Height must be a number up to 300") }));
                    }}
                    className="field-input-core pr-10"
                    min={0}
                    max={300}
                    inputMode="numeric"
                    aria-invalid={Boolean(fieldErrors.height)}
                  />
                  <span className="pointer-events-none absolute right-4 text-xs text-[var(--text-tertiary)]">cm</span>
                </div>
                {fieldErrors.height && <ErrorLabel message={fieldErrors.height} />}
              </div>
            </div>

            {/* Bio */}
            <div id="profile-field-bio">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Bio")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_bio}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_bio", checked)}
                  />
                </div>
              </div>
              <div className="form-field-rest relative h-auto min-h-[112px] py-3">
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder={t("Tell others about yourself...")}
                  className="field-input-core min-h-[88px] resize-none rounded-none border-0 bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0"
                />
              </div>
            </div>

            {/* Social Album */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Moments with furry friends in up to 5 photos</label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {formData.social_album.map((path) => {
                  const resolvedSrc = socialAlbumUrls[path] || "";
                  const fallbackSrc = socialAlbumFallbackPreviews[path] || "";
                  const canUseResolvedSrc = isRenderableImageSrc(resolvedSrc) && !socialAlbumLoadErrors[path];
                  const canUseFallbackSrc = isRenderableImageSrc(fallbackSrc);
                  const displaySrc = canUseResolvedSrc ? resolvedSrc : canUseFallbackSrc ? fallbackSrc : "";
                  return (
                  <div key={path} className="relative rounded-xl overflow-hidden border border-border bg-muted">
                    {displaySrc ? (
                      <img
                        src={displaySrc}
                        alt={t("Social Album")}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                        onError={() => {
                          const hasFallback = isRenderableImageSrc(socialAlbumFallbackPreviews[path] || "");
                          setSocialAlbumUrls((prev) => {
                            if (!prev[path]) return prev;
                            const next = { ...prev };
                            delete next[path];
                            return next;
                          });
                          if (!hasFallback) {
                            setSocialAlbumLoadErrors((prev) => ({ ...prev, [path]: true }));
                            return;
                          }
                          setSocialAlbumLoadErrors((prev) => {
                            if (!prev[path]) return prev;
                            const next = { ...prev };
                            delete next[path];
                            return next;
                          });
                          window.setTimeout(() => {
                            void refreshSocialAlbumUrls(socialAlbumRef.current);
                          }, 500);
                        }}
                      />
                    ) : (
                      <div className="w-full h-24 bg-[rgba(66,73,101,0.08)] flex flex-col items-center justify-center gap-1 text-[11px] text-[rgba(74,73,101,0.55)]">
                        <span>Unavailable</span>
                        <button
                          type="button"
                          className="text-[10px] underline underline-offset-2 text-[var(--brandBlue,#2145CF)]"
                          onClick={() => {
                            setSocialAlbumLoadErrors((prev) => {
                              if (!prev[path]) return prev;
                              const next = { ...prev };
                              delete next[path];
                              return next;
                            });
                            void refreshSocialAlbumUrls(socialAlbumRef.current);
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {recentlyUploadedAlbumPaths[path] &&
                      isRenderableImageSrc(socialAlbumUrls[path] || "") &&
                      !socialAlbumLoadErrors[path] && (
                      <div className="absolute inset-0 bg-emerald-600/35 flex items-center justify-center text-white">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveSocialAlbum(path)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )})}
                {pendingSocialUploads.map((item) => (
                  <div key={item.id} className="relative rounded-xl overflow-hidden border border-border bg-muted">
                    <img
                      src={item.previewUrl}
                      alt={t("Social Album upload")}
                      className={cn("w-full h-24 object-cover", item.status === "uploading" && "blur-[2px] opacity-70")}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center text-white text-xs font-semibold">
                      {item.status === "uploading" ? (
                        <>
                          <span>{Math.round(item.progress)}%</span>
                          <span className="text-[10px] font-medium mt-1">Uploading</span>
                        </>
                      ) : (
                        <span className="text-[10px]">Upload failed</span>
                      )}
                    </div>
                  </div>
                ))}
                {formData.social_album.length + pendingSocialUploads.length < 5 && (
                  <label className="h-24 rounded-xl border border-dashed border-border flex items-center justify-center cursor-pointer">
                    <div className="w-9 h-9 rounded-full bg-brandBlue text-white flex items-center justify-center shadow-[0_2px_8px_rgba(33,69,207,0.35)]">
                      <Plus className="w-5 h-5" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        handleSocialAlbumUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* DEMOGRAPHICS */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Demographics")}</h3>

            {/* Gender */}
            <div id="profile-field-gender">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Gender")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_gender}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_gender", checked)}
                  />
                </div>
              </div>
              <NeuDropdown
                placeholder="Select"
                options={genderOptions.map(o => ({ value: o, label: o }))}
                value={formData.gender_genre}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, gender_genre: value }));
                  setFieldErrors((prev) => ({ ...prev, gender: value ? "" : REQUIRED_CONNECT_ERROR }));
                }}
                error={fieldErrors.gender || undefined}
              />
            </div>

            {/* Sexual Orientation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Sexual Orientation")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_orientation}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_orientation", checked)}
                  />
                </div>
              </div>
              <NeuDropdown
                placeholder="Select"
                options={orientationOptions.map(o => ({ value: o, label: o }))}
                value={formData.orientation}
                onValueChange={(value) => setFormData(prev => ({ ...prev, orientation: value }))}
              />
            </div>
          </div>

          {/* EDUCATION & CAREER */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">EDUCATION & CAREER</h3>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                <NeuToggle
                  checked={formData.show_academic}
                  onCheckedChange={(checked) => handleVisibilityToggle("show_academic", checked)}
                />
              </div>
            </div>

            {/* Degree */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Highest Degree")}</label>
              <NeuDropdown
                placeholder="Select"
                options={degreeOptions.map(d => ({ value: d, label: d }))}
                value={formData.degree}
                onValueChange={(value) => setFormData(prev => ({ ...prev, degree: value }))}
              />
            </div>

            <div className="form-field-rest relative flex items-center">
              <input
                value={formData.school}
                onChange={(e) => setFormData(prev => ({ ...prev, school: e.target.value }))}
                onBlur={() => {
                  const invalid = NUMERIC_ONLY_REGEX.test(formData.school.trim()) && formData.school.trim().length > 0;
                  setFieldErrors((prev) => ({ ...prev, school: invalid ? t("School cannot be numbers only") : "" }));
                }}
                placeholder={t("School Name")}
                className="field-input-core"
                aria-invalid={Boolean(fieldErrors.school)}
              />
            </div>
            {fieldErrors.school && <ErrorLabel message={fieldErrors.school} />}

            <div className="form-field-rest relative flex items-center">
              <input
                value={formData.major}
                onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
                onBlur={() => {
                  const invalid = NUMERIC_ONLY_REGEX.test(formData.major.trim()) && formData.major.trim().length > 0;
                  setFieldErrors((prev) => ({ ...prev, major: invalid ? t("Major cannot be numbers only") : "" }));
                }}
                placeholder={t("Major / Field of Study")}
                className="field-input-core"
                aria-invalid={Boolean(fieldErrors.major)}
              />
            </div>
            {fieldErrors.major && <ErrorLabel message={fieldErrors.major} />}

            {/* Occupation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Occupation")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_occupation}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_occupation", checked)}
                  />
                </div>
              </div>
              <div className="form-field-rest relative flex items-center">
                <input
                  value={formData.occupation}
                  onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                  onBlur={() => {
                    const invalid = NUMERIC_ONLY_REGEX.test(formData.occupation.trim()) && formData.occupation.trim().length > 0;
                    setFieldErrors((prev) => ({ ...prev, occupation: invalid ? t("Occupation cannot be numbers only") : "" }));
                  }}
                  className="field-input-core"
                  aria-invalid={Boolean(fieldErrors.occupation)}
                />
              </div>
              {fieldErrors.occupation && <ErrorLabel message={fieldErrors.occupation} />}
            </div>
          </div>

          {/* Affiliation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t("Affiliation")}</label>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                <NeuToggle
                  checked={formData.show_affiliation}
                  onCheckedChange={(checked) => handleVisibilityToggle("show_affiliation", checked)}
                />
              </div>
            </div>
            <div className="form-field-rest relative h-auto min-h-[96px] py-3">
              <textarea
                value={formData.affiliation}
                onChange={(e) => setFormData(prev => ({ ...prev, affiliation: e.target.value }))}
                placeholder={t("Shelters, clubs, organizations...")}
                className="field-input-core resize-none min-h-[72px]"
              />
            </div>
          </div>

          {/* SOCIAL & LIFESTYLE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Social & Lifestyle")}</h3>

            {/* Relationship Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Relationship Status")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_relationship_status}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_relationship_status", checked)}
                  />
                </div>
              </div>
              <NeuDropdown
                placeholder="Select"
                options={relationshipOptions.map(r => ({ value: r, label: r }))}
                value={formData.relationship_status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, relationship_status: value }))}
              />
            </div>

            {/* Has Car */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-brandBlue" />
                <div>
                  <span className="text-sm font-medium">{t("Pet Driver with Car?")}</span>
                  <p className="text-xs text-muted-foreground">{t("Important for pet transport")}</p>
                </div>
              </div>
              <NeuToggle
                checked={formData.has_car}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_car: checked }))}
              />
            </div>

            {/* Languages */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Languages")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_languages}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_languages", checked)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                    >
                      <span className={cn("truncate", formData.languages.length === 0 && "text-muted-foreground")}>
                        {formData.languages.length > 0 ? formData.languages.join(", ") : "Select languages"}
                      </span>
                      <span className="text-muted-foreground">⌄</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={6}
                    className="z-[95] w-[min(360px,calc(100vw-40px))] p-2 rounded-[14px] border border-brandText/10 bg-white"
                  >
                    <div className="max-h-[220px] overflow-y-auto pr-1">
                      {languageOptions.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              languages: prev.languages.includes(lang)
                                ? prev.languages.filter((item) => item !== lang)
                                : [...prev.languages, lang],
                            }))
                          }
                          className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40"
                        >
                          <span>{lang}</span>
                          {formData.languages.includes(lang) ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Location */}
            <div id="profile-field-location">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Location")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_location}
                    onCheckedChange={(checked) => handleVisibilityToggle("show_location", checked)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Input closest street name to extract district
              </p>
              <div className="flex gap-2 mb-2">
                <NeuDropdown
                  className="flex-1"
                  placeholder="Street"
                  options={countryOptions.map(c => ({ value: c.code, label: c.label }))}
                  value={selectedCountry}
                  onValueChange={(code) => {
                    setSelectedCountry(code);
                    const countryLabel = countryOptions.find((country) => country.code === code)?.label || "";
                    const detectedCountry = resolvedLocationCountry || extractCountryFromPlaceLabel(formData.location_name || locationQuery);
                    setFormData((prev) => ({
                      ...prev,
                      location_country: countryLabel,
                    }));
                    if (
                      detectedCountry &&
                      countryLabel &&
                      detectedCountry.trim().toLowerCase() !== countryLabel.trim().toLowerCase()
                    ) {
                      setFieldErrors((prev) => ({ ...prev, location: "Country must match your location" }));
                    } else {
                      setFieldErrors((prev) => ({ ...prev, location: "" }));
                    }
                  }}
                />
              </div>
              <div className="form-field-rest relative flex items-center">
                <input
                  value={locationQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLocationQuery(next);
                    setResolvedLocationCountry("");
                    setLocationSuggestionsOpen(true);
                    setFormData((prev) => ({
                      ...prev,
                      location_district: next,
                      location_name: `${next}${prev.location_country ? `, ${prev.location_country}` : ""}`.trim(),
                    }));
                    setFieldErrors((prev) => ({ ...prev, location: next.trim() ? "" : REQUIRED_CONNECT_ERROR }));
                  }}
                  onFocus={() => setLocationSuggestionsOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setLocationSuggestionsOpen(false), 120);
                  }}
                  className="field-input-core pr-10"
                  placeholder="Input street for area match"
                />
                <button
                  type="button"
                  onClick={() => {
                    setLocationSuggestionsOpen(true);
                    handleCurrentLocation();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                  aria-label="Use current location"
                >
                  <MapPin className="w-4 h-4" />
                </button>
                {locationLoading && <p className="text-xs text-muted-foreground mt-1">Loading suggestions…</p>}
                {locationSuggestionsOpen && locationSuggestions.length > 0 && (
                  <div className="absolute top-10 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                    {locationSuggestions.map((item) => (
                      <button
                        key={`${item.label}-${item.lat}-${item.lng}`}
                        type="button"
                        onClick={() => {
                          const district = item.district || extractDistrictFromPlaceLabel(item.label);
                          const countryGuess = item.country || extractCountryFromPlaceLabel(item.label);
                          setLocationQuery(district);
                          setResolvedLocationCountry(countryGuess || "");
                          setLocationSuggestions([]);
                          setLocationSuggestionsOpen(false);
                          setLocationCoords({ lat: item.lat, lng: item.lng });
                          const matchedCountryCode = countryOptions.find((country) => country.label.toLowerCase() === countryGuess.toLowerCase())?.code || "";
                          if (matchedCountryCode) setSelectedCountry(matchedCountryCode);
                          setFormData((prev) => ({
                            ...prev,
                            location_name: `${district}${countryGuess ? `, ${countryGuess}` : ""}`.trim(),
                            location_district: district || prev.location_district,
                            location_country: countryGuess || prev.location_country,
                          }));
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {fieldErrors.location && <ErrorLabel message={fieldErrors.location} />}
            </div>
          </div>

          {/* PET EXPERIENCE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Pet Experience")}</h3>

            {/* Pet Experience Types */}
            <div id="profile-field-pet-experience">
              <label className="text-sm font-medium mb-2 block">{t("Experience with")}</label>
              <div className="space-y-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                    >
                      <span className={cn("truncate", formData.pet_experience.length === 0 && "text-muted-foreground")}>
                        {formData.pet_experience.length > 0 ? formData.pet_experience.join(", ") : "Select pet experience"}
                      </span>
                      <span className="text-muted-foreground">⌄</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    sideOffset={6}
                    className="z-[95] w-[min(360px,calc(100vw-40px))] p-2 rounded-[14px] border border-brandText/10 bg-white"
                  >
                    <div className="max-h-[220px] overflow-y-auto pr-1">
                      {petExperienceOptions.map((exp) => {
                        const hasPets = petsProfileCount > 0 || formData.owns_pets;
                        const noneDisabled = exp === "None" && hasPets;
                        return (
                          <button
                            key={exp}
                            type="button"
                            onClick={() => {
                              if (noneDisabled) {
                                setFieldErrors((prev) => ({ ...prev, petExperience: REQUIRED_CONNECT_ERROR }));
                                return;
                              }
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
                            disabled={noneDisabled}
                            className={cn(
                              "w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40",
                              noneDisabled && "opacity-45 cursor-not-allowed",
                            )}
                          >
                            <span>{exp}</span>
                            {formData.pet_experience.includes(exp) ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {fieldErrors.petExperience && <ErrorLabel message={fieldErrors.petExperience} />}
            </div>

            {/* Years of Experience */}
            {formData.pet_experience.length > 0 && !formData.pet_experience.includes("None") && (
              <div id="profile-field-experience-years">
                <label className="text-sm font-medium mb-2 block">{t("Years of Experience")}</label>
                <div className="form-field-rest relative flex items-center w-28">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={formData.experience_years}
                    onChange={(e) => setFormData(prev => ({ ...prev, experience_years: e.target.value }))}
                    onBlur={() => {
                      if (formData.pet_experience.length === 0 || formData.pet_experience.includes("None")) {
                        setFieldErrors((prev) => ({ ...prev, experienceYears: "" }));
                        return;
                      }
                      const years = Number(formData.experience_years);
                      const valid =
                        !!formData.experience_years &&
                        Number.isFinite(years) &&
                        years >= 0 &&
                        years <= 99;
                      setFieldErrors((prev) => ({ ...prev, experienceYears: valid ? "" : EXPERIENCE_YEARS_ERROR }));
                    }}
                    placeholder={t("0")}
                    className="field-input-core"
                    inputMode="decimal"
                    step="any"
                    aria-invalid={Boolean(fieldErrors.experienceYears)}
                  />
                </div>
                {fieldErrors.experienceYears && <ErrorLabel message={fieldErrors.experienceYears} />}
                {formData.experience_years === "0" && (
                  <p className="text-xs text-muted-foreground mt-1">{t("Less than 1 year")}</p>
                )}
              </div>
            )}
          </div>

          {/* Pet Ownership */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <span className="text-sm font-medium">{t("Currently own pets?")}</span>
            <NeuToggle
              checked={petsProfileCount > 0 ? true : formData.owns_pets}
              onCheckedChange={(checked) =>
                setFormData(prev => {
                  const nextAvailability = enforceAvailabilityDefaults(prev.availability_status, checked);
                  const nextExperience = checked
                    ? prev.pet_experience.filter((item) => item !== "None")
                    : prev.pet_experience;
                  return {
                    ...prev,
                    owns_pets: checked,
                    pet_experience: nextExperience,
                    non_social: nextAvailability.length === 0,
                    availability_status: nextAvailability,
                  };
                })
              }
              disabled={petsProfileCount > 0}
            />
          </div>

          {/* Social Availability */}
          <div id="profile-field-social-role" className="p-4 rounded-xl bg-muted/50 space-y-3">
            <span className="text-sm font-semibold">What should others know you as?</span>
            <div className="flex flex-wrap gap-2">
              {availabilityOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    const hasPets = petsProfileCount > 0 || formData.owns_pets;
                    if (hasPets && status === "Animal Friend (No Pet)") {
                      toast.error(t("Animal Friend (No Pet) is unavailable when you already have pet profiles"));
                      return;
                    }
                    if (!hasPets && status === "Pet Parent") {
                      toast.error(t("Pet Parent is unavailable when you have no pet profiles"));
                      return;
                    }
                    setFormData((prev) => {
                      const withoutOpposite =
                        status === DEFAULT_ROLE_WITH_PETS
                          ? prev.availability_status.filter((s) => s !== DEFAULT_ROLE_WITHOUT_PETS)
                          : status === DEFAULT_ROLE_WITHOUT_PETS
                          ? prev.availability_status.filter((s) => s !== DEFAULT_ROLE_WITH_PETS)
                          : prev.availability_status;
                      const isActive = withoutOpposite.includes(status);
                      const next = isActive
                        ? withoutOpposite.filter((s) => s !== status)
                        : [...withoutOpposite, status];
                      const withDefault = enforceAvailabilityDefaults(next, hasPets);
                      return { ...prev, non_social: withDefault.length === 0, availability_status: withDefault };
                    });
                  }}
                  disabled={
                    ((petsProfileCount > 0 || formData.owns_pets) && status === "Animal Friend (No Pet)") ||
                    (!(petsProfileCount > 0 || formData.owns_pets) && status === "Pet Parent")
                  }
                  className={cn(
                    "px-3 py-2 rounded-full text-sm font-medium transition-all",
                    formData.availability_status.includes(status)
                      ? "bg-accent text-accent-foreground"
                      : "bg-card text-muted-foreground border border-border",
                    (((petsProfileCount > 0 || formData.owns_pets) && status === "Animal Friend (No Pet)") ||
                      (!(petsProfileCount > 0 || formData.owns_pets) && status === "Pet Parent")) &&
                      "opacity-40 cursor-not-allowed"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
            {formData.availability_status.length === 0 && (
              <ErrorLabel message={REQUIRED_CONNECT_ERROR} />
            )}
            {fieldErrors.socialAvailability && (
              <ErrorLabel message={fieldErrors.socialAvailability} />
            )}
          </div>
        </div>
      </div>

      {/* Onboarding CTA footer */}
      {onboardingMode && (
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t border-border/20 px-4 py-3 space-y-2"
             style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 12px)" }}>
          <NeuButton
            variant="primary"
            className="w-full h-12"
            disabled={loading}
            onClick={handleSave}
          >
            {loading ? "Saving…" : mediaUploadInProgress ? "Complete profile (wait for uploads)" : "Complete profile"}
          </NeuButton>

          <NeuButton
            variant="ghost"
            className="w-full h-11"
            disabled={loading}
            onClick={handleSaveDraft}
          >
            {mediaUploadInProgress ? "Save draft (wait for uploads)" : "Save draft"}
          </NeuButton>
        </div>
      )}
      </>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4" style={{ paddingBottom: "calc(var(--nav-height, 64px) + env(safe-area-inset-bottom) + 20px)" }}>
        <PublicProfileView
          displayName={formData.display_name}
          bio={formData.bio}
          availabilityStatus={formData.availability_status}
          isVerified={isIdentityLocked}
          hasCar={formData.has_car}
          photoUrl={photoPreview}
          dob={formData.dob}
          gender={formData.gender_genre}
          orientation={formData.orientation}
          height={formData.height}
          petExperience={formData.pet_experience}
          experienceYears={formData.experience_years}
          relationshipStatus={formData.relationship_status}
          degree={formData.degree}
          school={formData.school}
          major={formData.major}
          occupation={formData.occupation}
          affiliation={formData.affiliation}
          locationName={formData.location_name}
          languages={formData.languages}
          socialAlbum={formData.social_album}
          socialAlbumUrls={socialAlbumUrls}
          petHeads={activePetHeads}
          visibility={{
            show_age: formData.show_age,
            show_gender: formData.show_gender,
            show_orientation: formData.show_orientation,
            show_height: formData.show_height,
            show_relationship_status: formData.show_relationship_status,
            show_academic: formData.show_academic,
            show_occupation: formData.show_occupation,
            show_affiliation: formData.show_affiliation,
            show_bio: formData.show_bio,
          }}
        />
      </div>
      )}

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default EditProfile;
