import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Loader2, Check, Save, Car, X, Pencil, MapPin, Plus, Eye, Calendar, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuDropdown } from "@/components/ui/NeuDropdown";
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
import { CANONICAL_GENDER_OPTIONS, CANONICAL_ORIENTATION_OPTIONS, CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS, CANONICAL_SOCIAL_ROLE_OPTIONS } from "@/lib/profileOptions";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlMap } from "@/lib/socialAlbum";
import {
  clearPendingSignupVerification,
  loadPendingSignupVerification,
  SETPROFILE_PREFILL_KEY,
  SIGNUP_VERIFY_SUBMITTED_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

// Option constants matching database schema
const genderOptions = [...CANONICAL_GENDER_OPTIONS];
const orientationOptions = [...CANONICAL_ORIENTATION_OPTIONS];
const degreeOptions = ["College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD", "PNA"];
const relationshipOptions = ["Single", "In a relationship", "Open relationship", "Married", "Divorced", "PNA"];
const petExperienceOptions = [...CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS];
const languageOptions = ["English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian", "Arabic", "Hindi", "Bengali", "Urdu", "Russian", "Turkish", "Thai", "Vietnamese", "Indonesian", "Malay", "Tamil", "Telugu", "Polish", "Dutch", "Swedish"];
const availabilityOptions = [...CANONICAL_SOCIAL_ROLE_OPTIONS];
const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const NUMERIC_ONLY_REGEX = /^\d+$/;
const DECIMAL_NUMBER_REGEX = /^\d+(?:\.\d+)?$/;
const REQUIRED_CONNECT_ERROR = "Required to help others connect with you";
const LEGAL_NAME_SUBTEXT = "Legal name should include at least two words - first and last name.";
const LEGAL_NAME_RETRY_ERROR = "Let’s try again with a valid legal name";
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

const hasValidLegalName = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => word.length >= 1);
};

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

const EditProfile = ({ onboardingMode = false }: EditProfileProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { data: signupData, reset: resetSignup } = useSignup();
  const [loading, setLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
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
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOriginalValue, setPhoneOriginalValue] = useState("");
  const [dobEditMode, setDobEditMode] = useState(false);
  const [languagesEditMode, setLanguagesEditMode] = useState(false);
  const languagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [profileMode, setProfileMode] = useState<"edit" | "view">("edit");
  const isIdentityLocked = profile?.is_verified === true;
  const verificationStatus = String(profile?.verification_status ?? "unverified").toLowerCase();
  const [socialAlbumUrls, setSocialAlbumUrls] = useState<Record<string, string>>({});
  // RULE 14 — keyboard-safe layout: track virtual keyboard offset
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [prefillHydrated, setPrefillHydrated] = useState(false);

  const resolveSetProfilePrefillKey = useCallback(() => {
    const owner = onboardingMode ? signupData.email : user?.id;
    const normalizedOwner = normalizeStorageOwner(owner || "");
    if (!normalizedOwner) return null;
    return buildScopedStorageKey(SETPROFILE_PREFILL_KEY, normalizedOwner);
  }, [onboardingMode, signupData.email, user?.id]);

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

  const showDiscoverAgeInfo = Boolean(formData.dob) && isAtLeast13FromDate(formData.dob) && !isAtLeast16FromDate(formData.dob);

  const getMissingRequiredFieldLabels = (): string[] => {
    const missing: string[] = [];
    const hasPets = petsProfileCount > 0 || formData.owns_pets;
    if (!hasValidLegalName(formData.legal_name)) missing.push("Legal name");
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

  const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  };

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
      sessionStorage.setItem(SIGNUP_VERIFY_SUBMITTED_KEY, "true");
    } catch {
      // no-op
    }
  };

  const validateRequiredFields = () => {
    const nextErrors: typeof fieldErrors = {
      ...fieldErrors,
      legalName: hasValidLegalName(formData.legal_name) ? "" : LEGAL_NAME_RETRY_ERROR,
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

      if (next.legalName && hasValidLegalName(formData.legal_name)) { next.legalName = ""; changed = true; }
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
    formData.legal_name,
    formData.display_name,
    formData.phone,
    formData.dob,
    formData.gender_genre,
    formData.location_name,
    formData.social_id,
    formData.availability_status,
    formData.pet_experience,
    formData.experience_years,
    formData.owns_pets,
    petsProfileCount,
  ]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!showLanguageMenu) return;
      const target = event.target as Node | null;
      if (!languagesContainerRef.current || (target && languagesContainerRef.current.contains(target))) return;
      setShowLanguageMenu(false);
      setLanguagesEditMode(false);
      setLanguageQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showLanguageMenu]);

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

  useEffect(() => {
    const prefillKey = resolveSetProfilePrefillKey();
    const cachedPrefill = (() => {
      if (!prefillKey) return {} as Record<string, unknown>;
      try {
        const raw = localStorage.getItem(prefillKey) || "{}";
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
    const cachedValue = (key: string): string => {
      if (cachedDraft && typeof cachedDraft[key] === "string") return String(cachedDraft[key] || "");
      const legacy = cachedPrefill[key];
      return typeof legacy === "string" ? legacy : "";
    };
    const cachedSocialAlbum = (() => {
      if (cachedDraft?.social_album && Array.isArray(cachedDraft.social_album)) {
        return canonicalizeSocialAlbumEntries(
          (cachedDraft.social_album as unknown[]).filter((value): value is string => typeof value === "string"),
        );
      }
      try {
        const raw = typeof cachedPrefill.social_album === "string" ? cachedPrefill.social_album : "[]";
        const parsed = JSON.parse(raw) as string[];
        return Array.isArray(parsed) ? canonicalizeSocialAlbumEntries(parsed) : [];
      } catch {
        return [] as string[];
      }
    })();
    const signupDob = onboardingMode ? signupData.dob : "";
    const signupDisplayName = onboardingMode ? signupData.display_name : "";
    const signupSocialId = onboardingMode ? signupData.social_id : "";
    const signupPhone = onboardingMode ? signupData.phone : "";
    const signupLegalName = onboardingMode ? signupData.legal_name : "";

    const displayName = profile?.display_name || signupDisplayName || cachedValue("display_name");
    const legalName = profile?.legal_name || signupLegalName || cachedValue("legal_name");
    const phone = profile?.phone || signupPhone || cachedValue("phone");
    const dob = profile?.dob || signupDob || cachedValue("dob");
    const bio = profile?.bio || cachedValue("bio");
    const socialId = profile?.social_id || signupSocialId || cachedValue("social_id");
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
    const cachedLanguages = Array.isArray(cachedDraft?.languages)
      ? (cachedDraft?.languages as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    const cachedPetExperience = Array.isArray(cachedDraft?.pet_experience)
      ? (cachedDraft?.pet_experience as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    const cachedAvailability = Array.isArray(cachedDraft?.availability_status)
      ? (cachedDraft?.availability_status as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];
    const hasPetsFromProfile = Boolean(profile?.owns_pets);
    const normalizedAvailability = (profile?.availability_status || [])
      .map((status) => normalizeSocialRole(status))
      .filter((status): status is string => Boolean(status));
    const resolvedAvailability = enforceAvailabilityDefaults(
      normalizedAvailability.length > 0 ? normalizedAvailability : cachedAvailability,
      hasPetsFromProfile || Boolean(cachedDraft?.owns_pets),
    );
    const locationCountry = profile?.location_country || cachedValue("location_country");
    const locationDistrict = profile?.location_district || cachedValue("location_district");
    const locationName = profile?.location_name || `${locationDistrict}${locationCountry ? `, ${locationCountry}` : ""}`.trim();
    const parsedCountry = locationCountry || locationName.split(",").map((part) => part.trim()).filter(Boolean).pop();
    const matchedCountry = parsedCountry
      ? countryOptions.find((country) => country.label.toLowerCase() === parsedCountry.toLowerCase())
      : null;

    setFormData({
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
      has_car: profile?.has_car || Boolean(cachedDraft?.has_car),
      languages: profile?.languages || cachedLanguages,
      location_name: locationName,
      location_country: locationCountry,
      location_district: locationDistrict,
      pet_experience: profile?.pet_experience || cachedPetExperience,
      experience_years: profile?.experience_years?.toString() || cachedValue("experience_years"),
      owns_pets: profile?.owns_pets || Boolean(cachedDraft?.owns_pets),
      non_social: resolvedAvailability.length === 0,
      availability_status: resolvedAvailability,
      show_gender: profile?.show_gender ?? Boolean(cachedDraft?.show_gender ?? Boolean(genderGenre.trim())),
      show_orientation: profile?.show_orientation ?? Boolean(cachedDraft?.show_orientation ?? Boolean(orientation.trim())),
      show_age: profile?.show_age ?? Boolean(cachedDraft?.show_age ?? Boolean(dob)),
      show_height: profile?.show_height ?? Boolean(cachedDraft?.show_height ?? Boolean(height)),
      show_weight: profile?.show_weight ?? Boolean(cachedDraft?.show_weight ?? Boolean(weight)),
      show_academic: profile?.show_academic ?? Boolean(cachedDraft?.show_academic ?? Boolean(degree.trim() || school.trim() || major.trim())),
      show_affiliation: profile?.show_affiliation ?? Boolean(cachedDraft?.show_affiliation ?? Boolean(affiliation.trim())),
      show_occupation: profile?.show_occupation ?? Boolean(cachedDraft?.show_occupation ?? Boolean(occupation.trim())),
      show_bio: profile?.show_bio ?? Boolean(cachedDraft?.show_bio ?? Boolean(bio.trim())),
      show_relationship_status: profile?.show_relationship_status ?? Boolean(cachedDraft?.show_relationship_status ?? Boolean(relationshipStatus.trim())),
      show_languages: Boolean((profile?.prefs as Record<string, unknown> | null)?.show_languages ?? cachedDraft?.show_languages ?? false),
      show_location: Boolean((profile?.prefs as Record<string, unknown> | null)?.show_location ?? cachedDraft?.show_location ?? false),
      social_album: canonicalizeSocialAlbumEntries(profile?.social_album || cachedSocialAlbum),
    });
    setSelectedCountry(matchedCountry?.code || "");
    if (profile?.avatar_url) {
      setPhotoPreview(profile.avatar_url);
    } else if (
      onboardingMode &&
      typeof cachedPrefill.avatar_url === "string" &&
      typeof cachedPrefill.prefill_owner === "string" &&
      cachedPrefill.prefill_owner.trim().toLowerCase() === (signupData.email || "").trim().toLowerCase()
    ) {
      setPhotoPreview(cachedPrefill.avatar_url);
    } else {
      setPhotoPreview(null);
    }
    if (profile?.social_album && profile.social_album.length > 0) {
      refreshSocialAlbumUrls(canonicalizeSocialAlbumEntries(profile.social_album));
    } else if (cachedSocialAlbum.length > 0) {
      refreshSocialAlbumUrls(canonicalizeSocialAlbumEntries(cachedSocialAlbum));
    }
    setPhoneOriginalValue(phone);
    setPhoneOtpVerified(Boolean(phone));
    setLocationQuery(locationName);
    setResolvedLocationCountry(extractCountryFromPlaceLabel(locationName) || locationCountry || "");
    setPrefillHydrated(true);
  }, [
    onboardingMode,
    profile,
    resolveSetProfilePrefillKey,
    signupData.display_name,
    signupData.dob,
    signupData.email,
    signupData.legal_name,
    signupData.phone,
    signupData.social_id,
  ]);

  useEffect(() => {
    if (!onboardingMode) return;
    if (!prefillHydrated) return;
    const prefillKey = resolveSetProfilePrefillKey();
    if (!prefillKey) return;
    try {
      localStorage.setItem(
        prefillKey,
        JSON.stringify({
          prefill_owner: (signupData.email || user?.id || "").trim().toLowerCase(),
          form_data: formData,
          display_name: formData.display_name,
          social_id: formData.social_id,
          phone: formData.phone,
          dob: formData.dob,
          legal_name: formData.legal_name,
          location_country: formData.location_country,
          location_district: formData.location_district,
          avatar_url: photoPreview || "",
          social_album: JSON.stringify(formData.social_album),
        }),
      );
    } catch {
      // no-op
    }
  }, [
    onboardingMode,
    prefillHydrated,
    formData,
    photoPreview,
    resolveSetProfilePrefillKey,
    signupData.email,
    user?.id,
  ]);

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
    if (!/^[A-Za-z0-9_.-]{6,15}$/.test(current)) {
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

  const refreshSocialAlbumUrls = async (paths: string[]) => {
    const normalizedPaths = canonicalizeSocialAlbumEntries(paths);
    if (!normalizedPaths.length) {
      setSocialAlbumUrls({});
      return;
    }
    const next = await resolveSocialAlbumUrlMap(normalizedPaths, 60 * 60);
    setSocialAlbumUrls(next);
  };

  const handleSocialAlbumUpload = async (file: File) => {
    if (!user) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const encoded = String(reader.result || "");
        if (!encoded) return;
        setFormData((prev) => ({
          ...prev,
          social_album: canonicalizeSocialAlbumEntries([...prev.social_album, encoded]).slice(0, 5),
        }));
      };
      reader.readAsDataURL(file);
      return;
    }
    const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1600, useWebWorker: true };
    const compressed = await imageCompression(file, options);
    if (compressed.size > 500 * 1024) {
      toast.error(t("Image must be under 500KB"));
      return;
    }
    const ext = compressed.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("social_album")
      .upload(filePath, compressed, { upsert: false });
    if (uploadError) {
      toast.error(uploadError.message || t("Upload failed"));
      return;
    }
    const nextAlbum = canonicalizeSocialAlbumEntries([...formData.social_album, filePath]).slice(0, 5);
    setFormData((prev) => ({ ...prev, social_album: nextAlbum }));
    await refreshSocialAlbumUrls(nextAlbum);
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

  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev };
      let changed = false;
      const nextShowGender = Boolean(prev.gender_genre.trim());
      const nextShowOrientation = Boolean(prev.orientation.trim());
      const nextShowAge = Boolean(prev.dob);
      const nextShowHeight = Boolean(prev.height);
      const nextShowWeight = Boolean(prev.weight);
      const nextShowAcademic = Boolean(prev.degree.trim() || prev.school.trim() || prev.major.trim());
      const nextShowAffiliation = Boolean(prev.affiliation.trim());
      const nextShowOccupation = Boolean(prev.occupation.trim());
      const nextShowBio = Boolean(prev.bio.trim());
      const nextShowRelationship = Boolean(prev.relationship_status.trim());
      const nextShowLanguages = prev.languages.length > 0;
      const nextShowLocation = Boolean(prev.location_country.trim() || prev.location_district.trim());

      if (prev.show_gender !== nextShowGender) { next.show_gender = nextShowGender; changed = true; }
      if (prev.show_orientation !== nextShowOrientation) { next.show_orientation = nextShowOrientation; changed = true; }
      if (prev.show_age !== nextShowAge) { next.show_age = nextShowAge; changed = true; }
      if (prev.show_height !== nextShowHeight) { next.show_height = nextShowHeight; changed = true; }
      if (prev.show_weight !== nextShowWeight) { next.show_weight = nextShowWeight; changed = true; }
      if (prev.show_academic !== nextShowAcademic) { next.show_academic = nextShowAcademic; changed = true; }
      if (prev.show_affiliation !== nextShowAffiliation) { next.show_affiliation = nextShowAffiliation; changed = true; }
      if (prev.show_occupation !== nextShowOccupation) { next.show_occupation = nextShowOccupation; changed = true; }
      if (prev.show_bio !== nextShowBio) { next.show_bio = nextShowBio; changed = true; }
      if (prev.show_relationship_status !== nextShowRelationship) { next.show_relationship_status = nextShowRelationship; changed = true; }
      if (prev.show_languages !== nextShowLanguages) { next.show_languages = nextShowLanguages; changed = true; }
      if (prev.show_location !== nextShowLocation) { next.show_location = nextShowLocation; changed = true; }
      return changed ? next : prev;
    });
  }, [
    formData.gender_genre,
    formData.orientation,
    formData.dob,
    formData.height,
    formData.weight,
    formData.degree,
    formData.school,
    formData.major,
    formData.affiliation,
    formData.occupation,
    formData.bio,
    formData.relationship_status,
    formData.languages,
    formData.location_country,
    formData.location_district,
  ]);

  const handleRemoveSocialAlbum = async (path: string) => {
    const next = canonicalizeSocialAlbumEntries(formData.social_album.filter((p) => p !== path));
    setFormData((prev) => ({ ...prev, social_album: next }));
    await refreshSocialAlbumUrls(next);
  };

  const removeLanguage = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.filter(l => l !== lang)
    }));
  };

  const toggleLanguage = (lang: string) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((item) => item !== lang)
        : [...prev.languages, lang],
    }));
  };

  const requestPhoneOtp = async () => {
    if (!formData.phone.trim()) {
      setFieldErrors((prev) => ({ ...prev, phone: t("Phone number is required") }));
      return;
    }
    if (!E164_PHONE_REGEX.test(formData.phone.trim())) {
      setFieldErrors((prev) => ({ ...prev, phone: t("Phone number must include country code, e.g. +85212345678") }));
      return;
    }
    const result = await requestPhoneOtpCode(formData.phone.trim());
    if (!result.ok) {
      toast.error(result.error || "Failed to send OTP. Please retry.");
      return;
    }
    setPhoneOtpRequested(true);
    setPhoneOtpVerified(false);
    toast.success(t("OTP sent to your phone"));
  };

  const verifyPhoneOtp = async () => {
    if (!phoneOtpCode.trim()) return;
    const result = await verifyPhoneOtpCode(formData.phone.trim(), phoneOtpCode.trim());
    if (!result.ok) {
      toast.error(result.error || "OTP verification failed");
      return;
    }
    setPhoneOtpVerified(true);
    setPhoneOtpRequested(false);
    setPhoneOtpCode("");
    setPhoneEditMode(false);
    setPhoneOriginalValue(formData.phone.trim());
    toast.success(t("Phone verified"));
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

  const openVerifyIdentity = () => {
    const returnTo = onboardingMode ? "/set-profile" : "/edit-profile";
    navigate("/verify-identity", { state: { returnTo } });
  };

  const handleSave = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    let activeUser = user ?? sessionData.session?.user ?? null;
    const missingFields = getMissingRequiredFieldLabels();
    if (missingFields.length > 0) {
      validateRequiredFields();
      toast.error(formatMissingFieldsToast(missingFields));
      return;
    }

    if (!activeUser) {
      if (!onboardingMode) {
        toast.error("Please sign in to continue.");
        navigate("/auth");
        return;
      }
      try {
        const email = (signupData.email || "").trim();
        const password = signupData.password || "";
        if (!email || !password) {
          toast.error("Please sign in to continue.");
          navigate("/auth");
          return;
        }

        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: formData.display_name,
              legal_name: formData.legal_name,
              dob: formData.dob,
              phone: formData.phone,
              social_id: formData.social_id,
            },
          },
        });
        if (signupError && !isAlreadyRegisteredError(signupError.message)) {
          throw signupError;
        }

        let nextSessionUser = (await supabase.auth.getSession()).data.session?.user ?? null;
        if (!nextSessionUser) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
          nextSessionUser = (await supabase.auth.getSession()).data.session?.user ?? null;
        }

        if (!nextSessionUser) {
          toast.error("Please verify your email, then sign in to continue.");
          navigate("/auth");
          return;
        }

        activeUser = nextSessionUser;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(message || "Please sign in to continue.");
        return;
      }
    }

    if (!hasValidLegalName(formData.legal_name)) {
      setFieldErrors((prev) => ({ ...prev, legalName: LEGAL_NAME_RETRY_ERROR }));
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
    if (!E164_PHONE_REGEX.test(formData.phone.trim())) {
      setFieldErrors((prev) => ({
        ...prev,
        phone: t("Phone number must include country code, e.g. +85212345678"),
      }));
      return;
    }
    if (phoneEditMode || (formData.phone.trim() !== phoneOriginalValue.trim() && !phoneOtpVerified)) {
      setFieldErrors((prev) => ({ ...prev, phone: t("Please verify phone with OTP before saving") }));
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
    if (!/^[A-Za-z0-9_.-]+$/.test(formData.social_id.trim())) {
      setFieldErrors((prev) => ({ ...prev, social_id: t("Only letters, numbers, dot, underscore, hyphen") }));
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
      let avatarUrl = profile?.avatar_url;

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${activeUser.id}/avatar_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, photoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        avatarUrl = publicUrl;
        setPhotoPreview(publicUrl);
        setPhotoFile(null);
      }

      const profilePayload = {
          display_name: formData.display_name,
          legal_name: formData.legal_name,
          phone: formData.phone || null,
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
          updated_at: new Date().toISOString(),
      };

      const profileWrite = await supabase
        .from("profiles")
        .upsert(
          {
            id: activeUser.id,
            ...profilePayload,
            onboarding_completed: onboardingMode ? true : profile?.onboarding_completed ?? false,
          },
          { onConflict: "id" },
        );

      const error = profileWrite.error;

      if (error) throw error;

      if (onboardingMode) {
        await finalizePendingVerification(activeUser.id);
      }

      await refreshProfile();
      if (onboardingMode) {
        resetSignup();
        try {
          const prefillKey = resolveSetProfilePrefillKey();
          if (prefillKey) {
            localStorage.removeItem(prefillKey);
          }
        } catch {
          // no-op
        }
      }
      if (!onboardingMode) {
        toast.success(t("Profile updated!"));
      }
      if (onboardingMode) {
        const shouldSetPet = petsProfileCount > 0 || formData.owns_pets === true;
        if (!shouldSetPet) {
          toast.success("Welcome to Huddle! Pet care tracking, nearby connections, and all pet community happenings – right in your palm now!");
        }
        navigate(shouldSetPet ? "/set-pet" : "/");
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
            onClick={() => {
              if (!validateRequiredFields()) {
                const missingFields = getMissingRequiredFieldLabels();
                toast.error(formatMissingFieldsToast(missingFields));
                return;
              }
              setProfileMode("view");
            }}
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
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 pb-6" style={{ paddingBottom: keyboardOffset > 0 ? `${keyboardOffset + 24}px` : undefined }}>
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt={t("Profile")} className="w-full h-full object-cover" />
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

          {/* BASIC INFO */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Basic Info")}</h3>

            {/* Legal Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Legal Name")}</label>
              <div className={cn("form-field-rest relative flex items-center", isIdentityLocked && "opacity-60")}>
                <input
                  value={formData.legal_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      legalName: hasValidLegalName(formData.legal_name) ? "" : LEGAL_NAME_SUBTEXT,
                    }))
                  }
                  placeholder="First Name and Last Name"
                  className="field-input-core pr-[88px]"
                  required
                  disabled={false}
                  aria-invalid={Boolean(fieldErrors.legalName)}
                />
                {verificationStatus === "unverified" && (
                  <NeuControl size="sm" variant="secondary" onClick={openVerifyIdentity} className="absolute right-2 top-1/2 -translate-y-1/2 h-8">
                    Verify
                  </NeuControl>
                )}
                {verificationStatus === "pending" && (
                  <NeuControl size="sm" variant="secondary" disabled className="absolute right-2 top-1/2 -translate-y-1/2 h-8">
                    Pending
                  </NeuControl>
                )}
                {verificationStatus === "verified" && (
                  <NeuControl size="sm" variant="secondary" disabled className="absolute right-2 top-1/2 -translate-y-1/2 h-8">
                    Verified
                  </NeuControl>
                )}
              </div>
              {fieldErrors.legalName && <ErrorLabel message={fieldErrors.legalName} />}
            </div>

            {/* Display Name */}
            <div>
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
            <div>
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
                      const normalized = e.target.value.toLowerCase().replace(/\s/g, "");
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

            {/* Phone */}
            <div>
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
                      setPhoneOtpVerified(false);
                      setPhoneOtpCode("");
                    }}
                    className="p-1 text-muted-foreground"
                    aria-label="Edit phone"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={cn("form-field-rest relative flex items-center bg-white", fieldErrors.phone && "form-field-error")}>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, phone: e.target.value }));
                        setPhoneOtpVerified(e.target.value.trim() === phoneOriginalValue.trim());
                      }}
                      className="field-input-core pr-24"
                      placeholder="+852 1234 5678"
                      disabled={false}
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                    {!phoneOtpVerified && (
                      <NeuControl type="button" size="sm" variant="secondary" onClick={requestPhoneOtp} className="absolute right-2 top-1/2 -translate-y-1/2 h-8">
                        SEND OTP
                      </NeuControl>
                    )}
                  </div>
                  {!phoneOtpVerified && (
                    <div className="flex gap-2">
                      {phoneOtpRequested && (
                        <>
                          <div className="form-field-rest relative flex items-center w-28">
                            <input
                              value={phoneOtpCode}
                              onChange={(e) => setPhoneOtpCode(e.target.value.replace(/[^\d]/g, ""))}
                              className="field-input-core text-center"
                              maxLength={6}
                              placeholder="OTP"
                            />
                          </div>
                          <NeuControl type="button" size="sm" onClick={verifyPhoneOtp} className="h-10">
                            Verify
                          </NeuControl>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            {fieldErrors.phone && <ErrorLabel message={fieldErrors.phone} />}
          </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,170px)] gap-3 items-start">
              <div>
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
              <div>
                <div className="flex items-center justify-between mb-2 h-6">
                  <label className="text-sm font-medium">Height</label>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                    <NeuToggle
                      checked={formData.show_height}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_height: checked }))}
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Bio")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_bio}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_bio: checked }))}
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
                {formData.social_album.map((path) => (
                  <div key={path} className="relative rounded-xl overflow-hidden border border-border bg-muted">
                    <img
                      src={socialAlbumUrls[path] || path}
                      alt={t("Social Album")}
                      className="w-full h-24 object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSocialAlbum(path)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {formData.social_album.length < 5 && (
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Gender")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_gender}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_gender: checked }))}
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
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_orientation: checked }))}
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
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_academic: checked }))}
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
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_occupation: checked }))}
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
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_affiliation: checked }))}
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
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_relationship_status: checked }))}
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
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_languages: checked }))}
                  />
                </div>
              </div>
              <div ref={languagesContainerRef} className="form-field-rest relative h-auto min-h-[52px] py-2">
                <div className="flex flex-wrap items-center gap-2 w-full pr-10">
                  {formData.languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground flex items-center gap-1"
                    >
                      {lang}
                      <button onClick={() => removeLanguage(lang)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {languagesEditMode && (
                    <input
                      value={languageQuery}
                      onChange={(e) => {
                        setLanguageQuery(e.target.value);
                        setShowLanguageMenu(true);
                      }}
                      onFocus={() => setShowLanguageMenu(true)}
                      className="field-input-core h-8 min-w-[120px]"
                      placeholder="Type language"
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-brandText"
                  onClick={() => {
                    const next = !languagesEditMode;
                    setLanguagesEditMode(next);
                    setShowLanguageMenu(next);
                    if (!next) setLanguageQuery("");
                  }}
                  aria-label="Edit languages"
                >
                  {showLanguageMenu ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
                {languagesEditMode && showLanguageMenu && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-border bg-card shadow-card max-h-56 overflow-y-auto">
                    {languageOptions
                      .filter((lang) => lang.toLowerCase().includes(languageQuery.toLowerCase()))
                      .map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => toggleLanguage(lang)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                        >
                          <span>{lang}</span>
                          {formData.languages.includes(lang) && <span className="text-primary">✓</span>}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Location")}</label>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" aria-hidden />
                  <NeuToggle
                    checked={formData.show_location}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_location: checked }))}
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
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Experience with")}</label>
              <div className="flex flex-wrap gap-2">
                {petExperienceOptions.map((exp) => (
                  <button
                    key={exp}
                    onClick={() => {
                      const hasPets = petsProfileCount > 0 || formData.owns_pets;
                      if (exp === "None" && hasPets) {
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
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition-all",
                      formData.pet_experience.includes(exp)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                      (exp === "None" && (petsProfileCount > 0 || formData.owns_pets)) && "opacity-45 cursor-not-allowed"
                    )}
                    disabled={exp === "None" && (petsProfileCount > 0 || formData.owns_pets)}
                  >
                    {exp}
                  </button>
                ))}
              </div>
              {fieldErrors.petExperience && <ErrorLabel message={fieldErrors.petExperience} />}
            </div>

            {/* Years of Experience */}
            {formData.pet_experience.length > 0 && !formData.pet_experience.includes("None") && (
              <div>
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
          <div className="p-4 rounded-xl bg-muted/50 space-y-3">
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
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-6">
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
