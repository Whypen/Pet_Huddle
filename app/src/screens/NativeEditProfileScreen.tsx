import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { isValidPhoneNumber } from "libphonenumber-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { NativeTurnstile } from "../components/NativeTurnstile";
import {
  emptyNativeProfileFormData,
  NativeProfileForm,
  nativeAvailabilityOptions,
  type NativeProfileFormData,
  type NativeProfileFormErrors,
} from "../components/profile/NativeProfileForm";
import { NativePublicProfileContent } from "../components/profile/NativePublicProfileContent";
import {
  canonicalizeNativeSocialAlbumEntries,
  fetchNativePublicProfile,
  mapNativePublicProfile,
  type NativePublicProfile,
} from "../lib/nativePublicProfile";
import {
  deleteNativeProfilePhotoPath,
  getNativeProfilePhotoPublicUrl,
  isNativePersistableStoragePath,
  isNativeProfilePhotoStoragePath,
  normalizeNativeProfilePhotos,
  sanitizeNativeProfilePhotosForDraft,
  type NativeProfilePhotos,
} from "../lib/nativeProfilePhotos";
import { invalidateNativeProfileImageResolverCache } from "../lib/nativeStorageUrlCache";
import { createNativeProtectedActionError, logNativeProtectedActionFailure } from "../lib/nativeStorageCleanup";
import {
  fetchNativeLocationSuggestions,
  normalizeNativeLocationTextFields,
  resolveCurrentNativeLocation,
  type NativeLocationSuggestion,
} from "../lib/nativeLocation";
import {
  isNativePhoneCountryAllowed,
  maskNativePhoneForOtpNotice,
  requestNativePhoneOtp,
  verifyNativePhoneOtp,
} from "../lib/nativePhoneOtp";
import { clearNativeProfileSummaryCache, writeNativeProfileSummaryCache } from "../lib/nativeProfileSummary";
import { checkIdentifierRegistered, checkSocialIdTaken } from "../lib/nativeSignup";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import {
  huddleButtons,
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

const turnstileSiteKey =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  "0x4AAAAAAC1AMILxX8-lFNmm";

type NativeEditProfileScreenProps = {
  accessToken?: string | null;
  initialSession?: Session | null;
  mode?: "edit" | "onboarding";
  onGoBack?: () => void;
  onNavigate: (path: string, options?: { preserveHistory?: boolean; refreshOnboarding?: boolean }) => void;
  sessionKey?: string | null;
  userId: string | null;
};

type ProfileRow = Record<string, unknown>;

const NATIVE_EDIT_PROFILE_SELECT = [
  "id",
  "email",
  "display_name",
  "legal_name",
  "phone",
  "phone_verification_status",
  "phone_verified_at",
  "dob",
  "gender_genre",
  "height",
  "weight",
  "weight_unit",
  "degree",
  "school",
  "major",
  "affiliation",
  "occupation",
  "orientation",
  "relationship_status",
  "owns_pets",
  "has_car",
  "languages",
  "availability_status",
  "pet_experience",
  "experience_years",
  "location_name",
  "location_country",
  "location_district",
  "last_lat",
  "last_lng",
  "location_pinned_until",
  "bio",
  "avatar_url",
  "photos",
  "social_album",
  "social_id",
  "show_gender",
  "show_age",
  "show_height",
  "show_weight",
  "show_academic",
  "show_affiliation",
  "show_bio",
  "show_occupation",
  "show_orientation",
  "show_relationship_status",
  "prefs",
  "onboarding_completed",
  "email_verified",
  "human_verification_status",
  "human_verified_at",
  "is_verified",
  "verification_status",
  "created_at",
  "last_active_at",
  "effective_tier",
  "tier",
  "updated_at",
].join(",");

type NativeEditRestError = {
  code?: string;
  message?: string;
};

const REQUIRED_CONNECT_ERROR = "Required to connect";
const EXPERIENCE_YEARS_ERROR = "Years must be a whole number from 0 to 99";
const NUMERIC_ONLY_REGEX = /^\d+$/;
const DECIMAL_NUMBER_REGEX = /^\d+(\.\d+)?$/;
const SOCIAL_ID_REGEX = /^[A-Za-z0-9_.-]{6,15}$/;
const DEFAULT_ROLE_WITH_PETS = "Pet Parent";
const DEFAULT_ROLE_WITHOUT_PETS = "Animal Friend (No Pet)";

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const draftKey = (mode: "edit" | "onboarding", userId: string) => `huddle_native_${mode}_profile_draft:${userId}`;
const PROFILE_DRAFT_VERSION = 2;
const PROFILE_FORM_FIELDS = Object.keys(emptyNativeProfileFormData()) as Array<keyof NativeProfileFormData>;
const normalizePhoneForCompare = (phone: string): string => String(phone || "").trim().replace(/[^\d+]/g, "");
const getSessionUserId = (session: Session | null | undefined) => cleanString(session?.user?.id);
const getSessionAccessToken = (session: Session | null | undefined) => cleanString(session?.access_token);
const nativeEditAuthHeaders = (accessToken: string, extra?: Record<string, string>) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: supabaseAnonKey,
  ...extra,
});
const parseNativeEditRestError = (value: unknown): NativeEditRestError | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    code: cleanString(record.code) || undefined,
    message: cleanString(record.message) || cleanString(record.error_description) || cleanString(record.error) || undefined,
  };
};
const parseNativeEditRestResponse = async <T,>(response: Response): Promise<{ data: T | null; error: NativeEditRestError | null; status: number }> => {
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok) {
    return { data: null, error: parseNativeEditRestError(parsed) ?? { message: raw || response.statusText }, status: response.status };
  }
  return { data: parsed as T, error: null, status: response.status };
};
const firstRow = <T,>(value: unknown): T | null => {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
};
const fetchNativeEditProfileRowWithToken = async (userId: string, accessToken: string): Promise<ProfileRow> => {
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("select", NATIVE_EDIT_PROFILE_SELECT);
  url.searchParams.set("limit", "1");
  const result = await parseNativeEditRestResponse<ProfileRow[]>(await fetch(url.toString(), {
    method: "GET",
    headers: nativeEditAuthHeaders(accessToken),
  }));
  const row = firstRow<ProfileRow>(result.data);
  if (__DEV__) {
    console.log("NATIVE_EDIT_PROFILE_PROFILE_QUERY", {
      userId,
      hasData: Boolean(row),
      errorCode: result.error?.code ?? null,
      errorMessage: result.error?.message ?? null,
      displayName: cleanString(row?.display_name) || null,
      socialId: cleanString(row?.social_id) || null,
    });
  }
  if (result.error) throw new Error(result.error.message || "Failed to load profile.");
  if (!row) throw new Error("We couldn't load your profile. Please try again.");
  return row;
};
const fetchNativeEditPetsWithToken = async (userId: string, accessToken: string) => {
  const url = new URL(`${supabaseUrl}/rest/v1/pets`);
  url.searchParams.set("owner_id", `eq.${userId}`);
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("select", "id,name,species,dob,photo_url,is_public,is_active");
  url.searchParams.set("limit", "20");
  const result = await parseNativeEditRestResponse<Array<Record<string, unknown>>>(await fetch(url.toString(), {
    method: "GET",
    headers: nativeEditAuthHeaders(accessToken),
  }));
  if (result.error) throw new Error(result.error.message || "Failed to load pets.");
  return Array.isArray(result.data) ? result.data : [];
};
const updateNativeEditProfileWithToken = async (userId: string, accessToken: string, payload: Record<string, unknown>): Promise<ProfileRow> => {
  if (__DEV__) {
    console.log("NATIVE_EDIT_PROFILE_SAVE_REQUEST", {
      method: "PATCH",
      userId,
      hasAuthorization: Boolean(accessToken),
    });
  }
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("select", NATIVE_EDIT_PROFILE_SELECT);
  const result = await parseNativeEditRestResponse<ProfileRow[]>(await fetch(url.toString(), {
    method: "PATCH",
    headers: nativeEditAuthHeaders(accessToken, {
      "content-type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify(payload),
  }));
  const row = firstRow<ProfileRow>(result.data);
  if (result.error) throw new Error(result.error.message || "Failed to update profile.");
  if (!row) throw new Error("We couldn't refresh your profile after saving.");
  return row;
};
const upsertNativeEditProfileWithToken = async (userId: string, accessToken: string, payload: Record<string, unknown>): Promise<ProfileRow> => {
  if (__DEV__) {
    console.log("NATIVE_EDIT_PROFILE_SAVE_REQUEST", {
      method: "POST",
      userId,
      hasAuthorization: Boolean(accessToken),
    });
  }
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("on_conflict", "id");
  url.searchParams.set("select", NATIVE_EDIT_PROFILE_SELECT);
  const result = await parseNativeEditRestResponse<ProfileRow[]>(await fetch(url.toString(), {
    method: "POST",
    headers: nativeEditAuthHeaders(accessToken, {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify({ id: userId, ...payload }),
  }));
  const row = firstRow<ProfileRow>(result.data);
  if (result.error) throw new Error(result.error.message || "Failed to save profile.");
  if (!row) throw new Error("We couldn't refresh your profile after saving.");
  return row;
};
const callNativeEditRpcWithToken = async (accessToken: string, rpcName: string, params: Record<string, unknown>) => {
  const result = await parseNativeEditRestResponse<unknown>(await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: nativeEditAuthHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify(params),
  }));
  if (result.error) throw new Error(result.error.message || `${rpcName} failed`);
  return result.data;
};
const fetchNativeEditMemberNumberWithToken = async (accessToken: string, createdAt: string): Promise<number | null> => {
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("created_at", `lte.${createdAt}`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    method: "HEAD",
    headers: nativeEditAuthHeaders(accessToken, { Prefer: "count=exact" }),
  });
  if (!response.ok) return null;
  const contentRange = response.headers.get("content-range") || "";
  const count = Number(contentRange.split("/").pop());
  return Number.isFinite(count) ? count : null;
};
const extractCountryFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "";
};
const getHumanPhoneOtpMessage = (message?: string | null) => {
  const raw = String(message || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (
    lower.includes("turnstile") ||
    lower.includes("captcha") ||
    lower.includes("verification_required") ||
    lower.includes("human verification") ||
    lower.includes("edge function") ||
    lower.includes("rpc") ||
    lower.includes("invalid") ||
    lower.includes("not configured") ||
    lower.includes("provider") ||
    lower.includes("native")
  ) {
    return "Complete the security check to send code.";
  }

  if (lower.includes("rate") || lower.includes("cooldown")) {
    return "Please wait a moment before requesting another code.";
  }

  if (lower.includes("expired")) return "That code expired. Please request a new one.";
  if (lower.includes("wrong") || lower.includes("incorrect")) return "That code looks wrong. Please try again.";
  return raw;
};

const isCanonicalPhoneVerified = (
  phoneValue: string,
  profilePhone: unknown,
  profilePhoneVerificationStatus: unknown,
  profilePhoneVerifiedAt: unknown,
) => {
  const normalizedPhone = normalizePhoneForCompare(phoneValue);
  if (!normalizedPhone) return false;
  return (
    profilePhoneVerificationStatus === "verified" &&
    Boolean(profilePhoneVerifiedAt) &&
    normalizePhoneForCompare(cleanString(profilePhone)) === normalizedPhone
  );
};

const isAtLeast13FromDate = (isoDate: string) => {
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 13;
};

const sanitizeAvailabilityStatus = (roles: string[]) => (
  roles.filter((role) => nativeAvailabilityOptions.includes(role))
);

const enforceAvailabilityDefaults = (roles: string[], hasPets: boolean) => {
  const withoutInvalid = roles.filter((role) => (
    hasPets ? role !== DEFAULT_ROLE_WITHOUT_PETS : role !== DEFAULT_ROLE_WITH_PETS
  ));
  const required = hasPets ? DEFAULT_ROLE_WITH_PETS : DEFAULT_ROLE_WITHOUT_PETS;
  return withoutInvalid.includes(required) ? withoutInvalid : [required, ...withoutInvalid];
};

const mapRowToForm = (row: ProfileRow | null): NativeProfileFormData => {
  const form = emptyNativeProfileFormData();
  if (!row) return form;
  const socialAlbum = canonicalizeNativeSocialAlbumEntries(isStringArray(row.social_album) ? row.social_album : []);
  const bio = cleanString(row.bio);
  const prefs = row.prefs && typeof row.prefs === "object" ? row.prefs as Record<string, unknown> : {};
  return {
    ...form,
    affiliation: cleanString(row.affiliation),
    availability_status: isStringArray(row.availability_status) ? sanitizeAvailabilityStatus(row.availability_status) : [],
    bio,
    degree: cleanString(row.degree),
    display_name: cleanString(row.display_name),
    dob: cleanString(row.dob),
    experience_years: row.experience_years == null ? "" : String(row.experience_years),
    gender_genre: cleanString(row.gender_genre),
    has_car: row.has_car === true,
    height: row.height == null ? "" : String(row.height),
    languages: isStringArray(row.languages) ? row.languages : [],
    legal_name: cleanString(row.legal_name),
    location_country: cleanString(row.location_country),
    location_district: cleanString(row.location_district),
    location_name: cleanString(row.location_name),
    major: cleanString(row.major),
    occupation: cleanString(row.occupation),
    orientation: cleanString(row.orientation),
    owns_pets: row.owns_pets === true,
    pet_experience: isStringArray(row.pet_experience) ? row.pet_experience : [],
    phone: cleanString(row.phone),
    photos: normalizeNativeProfilePhotos(row.photos, { avatarUrl: cleanString(row.avatar_url), socialAlbum }),
    relationship_status: cleanString(row.relationship_status),
    school: cleanString(row.school),
    show_academic: row.show_academic === true,
    show_affiliation: row.show_affiliation === true,
    show_age: row.show_age === true,
    show_bio: Boolean((row.show_bio ?? Boolean(bio)) && bio),
    show_gender: row.show_gender === true,
    show_height: row.show_height === true,
    show_languages: prefs.show_languages === true,
    show_location: prefs.show_location === true,
    show_occupation: row.show_occupation === true,
    show_orientation: row.show_orientation === true,
    show_relationship_status: row.show_relationship_status === true,
    show_weight: row.show_weight === true,
    social_album: socialAlbum,
    social_id: cleanString(row.social_id),
    weight: row.weight == null ? "" : String(row.weight),
    weight_unit: row.weight_unit === "lb" ? "lb" : "kg",
  };
};

const formToDraftData = (form: NativeProfileFormData) => ({
  ...form,
  social_album: canonicalizeNativeSocialAlbumEntries(form.social_album.filter((entry) => isNativePersistableStoragePath(entry))),
  photos: sanitizeNativeProfilePhotosForDraft(form.photos),
});

type NativeProfileDraftPayload = {
  version: number;
  savedAt: string;
  baseUpdatedAt: string | null;
  sourceProfileId: string | null;
  dirtyFields: Array<keyof NativeProfileFormData>;
  form: ReturnType<typeof formToDraftData>;
};

const valuesEqual = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const isEmptyDraftValue = (field: keyof NativeProfileFormData, value: unknown) => {
  if (field === "weight_unit") return value === "kg" || value == null;
  if (field === "photos") {
    const photos = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return Object.values(photos).every((entry) => entry == null || entry === "");
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return value === false;
  if (typeof value === "string") return value.trim() === "";
  return value == null;
};

const isEffectivelyEmptyDraft = (draft: Partial<NativeProfileFormData>) => (
  PROFILE_FORM_FIELDS.every((field) => isEmptyDraftValue(field, draft[field]))
);

const inferLegacyDirtyFields = (draft: Partial<NativeProfileFormData>): Array<keyof NativeProfileFormData> => (
  PROFILE_FORM_FIELDS.filter((field) => !isEmptyDraftValue(field, draft[field]))
);

const parseDraftPayload = (rawDraft: string | null, profileId: unknown, profileUpdatedAt: unknown) => {
  if (!rawDraft) return { draft: null, dirtyFields: [] as Array<keyof NativeProfileFormData>, shouldClear: false };
  const sourceProfileId = cleanString(profileId);
  const updatedAt = cleanString(profileUpdatedAt);
  try {
    const parsed = JSON.parse(rawDraft) as Partial<NativeProfileDraftPayload> & Partial<NativeProfileFormData>;
    const hasMetadata = parsed.version === PROFILE_DRAFT_VERSION && parsed.form && typeof parsed.form === "object";
    const draft = hasMetadata ? parsed.form as Partial<NativeProfileFormData> : parsed as Partial<NativeProfileFormData>;
    const dirtyFields = hasMetadata && Array.isArray(parsed.dirtyFields)
      ? parsed.dirtyFields.filter((field): field is keyof NativeProfileFormData => PROFILE_FORM_FIELDS.includes(field as keyof NativeProfileFormData))
      : inferLegacyDirtyFields(draft);
    const isWrongProfile = hasMetadata && sourceProfileId && parsed.sourceProfileId !== sourceProfileId;
    const isStale = hasMetadata && updatedAt && parsed.baseUpdatedAt && parsed.baseUpdatedAt < updatedAt;
    const isEmpty = isEffectivelyEmptyDraft(draft) && dirtyFields.length === 0;
    return {
      draft: isWrongProfile || isStale || isEmpty ? null : draft,
      dirtyFields: isWrongProfile || isStale || isEmpty ? [] : dirtyFields,
      shouldClear: Boolean(isWrongProfile || isStale || isEmpty),
    };
  } catch {
    return { draft: null, dirtyFields: [] as Array<keyof NativeProfileFormData>, shouldClear: true };
  }
};

const mergeDirtyDraft = (
  seededForm: NativeProfileFormData,
  draft: Partial<NativeProfileFormData> | null,
  dirtyFields: Array<keyof NativeProfileFormData>,
) => {
  if (!draft || dirtyFields.length === 0) return seededForm;
  const next = { ...seededForm };
  dirtyFields.forEach((field) => {
    if (field === "legal_name") return;
    if (draft[field] !== undefined) {
      (next as Record<keyof NativeProfileFormData, unknown>)[field] = draft[field];
    }
  });
  if (dirtyFields.includes("photos") && draft.photos) {
    next.photos = { ...seededForm.photos, ...draft.photos };
  }
  return next;
};

type NativeProfilePayload = ReturnType<typeof buildProfilePayload>;

const buildProfilePayload = ({
  activePetCount,
  email,
  form,
  locationCoords,
  previousProfile,
}: {
  activePetCount: number;
  email?: string | null;
  form: NativeProfileFormData;
  locationCoords?: { lat: number; lng: number } | null;
  previousProfile: ProfileRow | null;
}) => {
  const photos = normalizeNativeProfilePhotos(form.photos);
  const socialAlbum = canonicalizeNativeSocialAlbumEntries([
    photos.establishing,
    photos.pack,
    photos.solo,
    photos.closer,
  ].filter((item): item is string => Boolean(item)));
  const hasPets = activePetCount > 0 || form.owns_pets;
  const prefs = previousProfile?.prefs && typeof previousProfile.prefs === "object" ? previousProfile.prefs as Record<string, unknown> : {};
  const location = normalizeNativeLocationTextFields({
    country: form.location_country,
    district: form.location_district,
  });
  const locationCountry = location.countryName || form.location_country || null;
  const locationDistrict = location.district || form.location_district || null;

  return {
    affiliation: form.affiliation || null,
    availability_status: enforceAvailabilityDefaults(sanitizeAvailabilityStatus(form.availability_status), hasPets),
    avatar_url: getNativeProfilePhotoPublicUrl(photos.cover),
    bio: form.bio,
    degree: form.degree || null,
    display_name: form.display_name.trim(),
    dob: form.dob || null,
    email: email || cleanString(previousProfile?.email) || null,
    experience_years: form.pet_experience.includes("None") || !form.experience_years ? null : parseFloat(form.experience_years),
    gender_genre: form.gender_genre || null,
    has_car: form.has_car,
    height: form.height ? parseInt(form.height, 10) : null,
    languages: form.languages.length > 0 ? form.languages : null,
    legal_name: form.legal_name || null,
    location_country: locationCountry,
    location_district: locationDistrict,
    location_name: form.location_name || `${locationDistrict || ""}${locationCountry ? `, ${locationCountry}` : ""}`.trim() || null,
    last_lat: locationCoords?.lat ?? (typeof previousProfile?.last_lat === "number" ? previousProfile.last_lat : null),
    last_lng: locationCoords?.lng ?? (typeof previousProfile?.last_lng === "number" ? previousProfile.last_lng : null),
    major: form.major || null,
    non_social: form.availability_status.length === 0,
    occupation: form.occupation || null,
    orientation: form.orientation || null,
    owns_pets: activePetCount > 0 ? true : form.owns_pets,
    pet_experience: form.pet_experience.length > 0 ? form.pet_experience : null,
    phone: form.phone.trim(),
    photos,
    prefs: {
      ...prefs,
      show_languages: Boolean(form.show_languages && form.languages.length > 0),
      show_location: Boolean(form.show_location && form.location_country && form.location_district),
    },
    relationship_status: form.relationship_status || null,
    school: form.school || null,
    show_academic: Boolean(form.show_academic && (form.degree || form.school || form.major)),
    show_affiliation: Boolean(form.show_affiliation && form.affiliation),
    show_age: true,
    show_bio: Boolean(form.show_bio && form.bio),
    show_gender: Boolean(form.show_gender && form.gender_genre),
    show_height: Boolean(form.show_height && form.height),
    show_occupation: Boolean(form.show_occupation && form.occupation),
    show_orientation: Boolean(form.show_orientation && form.orientation),
    show_relationship_status: Boolean(form.show_relationship_status && form.relationship_status),
    show_weight: Boolean(form.show_weight && form.weight),
    social_album: socialAlbum,
    social_id: form.social_id || null,
    updated_at: new Date().toISOString(),
    weight: form.weight ? parseFloat(form.weight) : null,
    weight_unit: form.weight_unit,
  };
};

const validateForm = (form: NativeProfileFormData, activePetCount: number): NativeProfileFormErrors => {
  const errors: NativeProfileFormErrors = {};
  const hasPets = activePetCount > 0 || form.owns_pets;
  if (!form.photos.cover) errors.photos = "Main photo is required";
  if (!form.display_name.trim()) errors.display_name = REQUIRED_CONNECT_ERROR;
  if (!form.phone.trim()) errors.phone = REQUIRED_CONNECT_ERROR;
  else if (!isValidPhoneNumber(form.phone.trim())) errors.phone = "Your phone number is invalid";
  if (!form.dob) errors.dob = REQUIRED_CONNECT_ERROR;
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob) || new Date(`${form.dob}T00:00:00`) > new Date()) errors.dob = "Human DOB cannot be in the future";
  else if (!isAtLeast13FromDate(form.dob)) errors.dob = "You must be at least 13 years old to use Huddle.";
  if (!form.gender_genre.trim()) errors.gender_genre = REQUIRED_CONNECT_ERROR;
  if (!form.location_country.trim() || !form.location_district.trim()) errors.location = REQUIRED_CONNECT_ERROR;
  else {
    const locationCountry = extractCountryFromPlaceLabel(form.location_name);
    if (locationCountry && locationCountry.toLowerCase() !== form.location_country.trim().toLowerCase()) {
      errors.location = "Country must match your location";
    }
  }
  if (!form.social_id.trim()) errors.social_id = REQUIRED_CONNECT_ERROR;
  else if (!SOCIAL_ID_REGEX.test(form.social_id)) errors.social_id = "Social ID must be 6-15 characters";
  if (form.height && (!NUMERIC_ONLY_REGEX.test(form.height) || Number(form.height) > 300)) errors.height = "Height must be a number up to 300";
  if (form.weight && (!DECIMAL_NUMBER_REGEX.test(form.weight) || Number(form.weight) > 700)) errors.weight = "Weight must be a number up to 700";
  if (NUMERIC_ONLY_REGEX.test(form.school.trim()) && form.school.trim()) errors.school = "School cannot be numbers only";
  if (NUMERIC_ONLY_REGEX.test(form.major.trim()) && form.major.trim()) errors.major = "Major cannot be numbers only";
  if (NUMERIC_ONLY_REGEX.test(form.occupation.trim()) && form.occupation.trim()) errors.occupation = "Occupation cannot be numbers only";
  if (hasPets && (form.pet_experience.length === 0 || form.pet_experience.includes("None"))) errors.pet_experience = REQUIRED_CONNECT_ERROR;
  if (!hasPets && form.pet_experience.length === 0) errors.pet_experience = REQUIRED_CONNECT_ERROR;
  if (form.availability_status.length === 0) errors.availability_status = REQUIRED_CONNECT_ERROR;
  if (form.pet_experience.length > 0 && !form.pet_experience.includes("None")) {
    const years = Number(form.experience_years);
    if (!form.experience_years || !Number.isInteger(years) || years < 0 || years > 99) {
      errors.experience_years = EXPERIENCE_YEARS_ERROR;
    }
  }
  return errors;
};

const clearResolvedFormErrors = (
  currentErrors: NativeProfileFormErrors,
  form: NativeProfileFormData,
  activePetCount: number,
): NativeProfileFormErrors => {
  const validated = validateForm(form, activePetCount);
  let changed = false;
  const nextErrors = { ...currentErrors };
  (Object.keys(currentErrors) as Array<keyof NativeProfileFormErrors>).forEach((key) => {
    if (!validated[key] && nextErrors[key]) {
      delete nextErrors[key];
      changed = true;
    }
  });
  return changed ? nextErrors : currentErrors;
};

const firstValidationMessage = (errors: NativeProfileFormErrors): string => {
  if (errors.photos) return errors.photos;
  if (errors.location) return errors.location === REQUIRED_CONNECT_ERROR ? "Country and District / Area are required." : errors.location;
  if (errors.display_name) return "Display/User Name is required.";
  if (errors.phone) return errors.phone;
  if (errors.dob) return errors.dob;
  if (errors.gender_genre) return "Gender is required.";
  if (errors.social_id) return errors.social_id;
  if (errors.pet_experience) return "Pet Experience is required.";
  if (errors.availability_status) return "What should others know you as? is required.";
  if (errors.experience_years) return errors.experience_years;
  if (errors.height) return errors.height;
  if (errors.weight) return errors.weight;
  if (errors.school) return errors.school;
  if (errors.major) return errors.major;
  if (errors.occupation) return errors.occupation;
  return "Almost there. Fill in the required fields to complete your profile.";
};

export function NativeEditProfileScreen({
  accessToken,
  initialSession,
  mode = "edit",
  onGoBack,
  onNavigate,
  sessionKey,
  userId,
}: NativeEditProfileScreenProps) {
  const [form, setForm] = useState<NativeProfileFormData>(() => emptyNativeProfileFormData());
  const [errors, setErrors] = useState<NativeProfileFormErrors>({});
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [activePetCount, setActivePetCount] = useState(0);
  const [publicProfile, setPublicProfile] = useState<NativePublicProfile | null>(null);
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveShakeAnim, triggerSaveShake] = useShakeAnimation();
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit");
  const [photoDeleteQueue, setPhotoDeleteQueue] = useState<string[]>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpMessage, setPhoneOtpMessage] = useState<string | null>(null);
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
  const [phoneOtpUnavailable, setPhoneOtpUnavailable] = useState(false);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);
  const [phoneOtpTurnstileToken, setPhoneOtpTurnstileToken] = useState("");
  const [phoneOtpTurnstileError, setPhoneOtpTurnstileError] = useState("");
  const [phoneSentMaskedHint, setPhoneSentMaskedHint] = useState<string | null>(null);
  const [phoneDuplicate, setPhoneDuplicate] = useState(false);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const [socialIdStatus, setSocialIdStatus] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  const editScrollRef = useRef<ScrollView | null>(null);
  const editScrollYRef = useRef(0);
  const previewScrollRef = useRef<ScrollView | null>(null);
  const hydratedRef = useRef(false);
  const loadFailedRef = useRef(false);
  const applyingHydrationRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const dirtyFieldsRef = useRef<Set<keyof NativeProfileFormData>>(new Set());
  const insets = useSafeAreaInsets();
  const liveAccessToken = cleanString(accessToken) || getSessionAccessToken(initialSession);

  const ensureNativeEditProfileSession = useCallback(async () => {
    const initialSessionUserId = getSessionUserId(initialSession);
    const matched = Boolean(userId && initialSessionUserId === userId && liveAccessToken && initialSession?.refresh_token);
    if (__DEV__) {
      console.log("NATIVE_EDIT_PROFILE_SESSION_PAIRING", {
        phase: "exact_token",
        propUserId: userId,
        initialSessionUserId,
        clientUserIdBefore: null,
        repaired: false,
        clientUserIdAfter: null,
        matched,
      });
    }
    if (!matched || !liveAccessToken) {
      throw new Error("Please sign in again to edit your profile.");
    }
    return liveAccessToken;
  }, [initialSession, liveAccessToken, userId]);

  const updateForm = useCallback((next: NativeProfileFormData | ((previous: NativeProfileFormData) => NativeProfileFormData)) => {
    setForm((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      if (hydratedRef.current && !applyingHydrationRef.current) {
        PROFILE_FORM_FIELDS.forEach((field) => {
          if (!valuesEqual(previous[field], resolved[field])) dirtyFieldsRef.current.add(field);
        });
      }
      return resolved;
    });
  }, []);

  const email = cleanString(profileRow?.email);
  const originalPhone = cleanString(profileRow?.phone);
  const phoneRequiresVerification = Boolean(
    form.phone.trim() &&
    normalizePhoneForCompare(form.phone) !== normalizePhoneForCompare(originalPhone),
  );
  const savedPhoneVerified = isCanonicalPhoneVerified(
    originalPhone,
    profileRow?.phone,
    profileRow?.phone_verification_status,
    profileRow?.phone_verified_at,
  );
  const shouldConfirmPhoneVerificationReset = Boolean(
    mode === "edit" &&
    savedPhoneVerified &&
    phoneRequiresVerification &&
    !phoneOtpVerified,
  );

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setMessage("Please sign in again to edit your profile.");
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    loadFailedRef.current = false;
    try {
      const accessToken = await ensureNativeEditProfileSession();
      const [data, petsRows, rawDraft] = await Promise.all([
        fetchNativeEditProfileRowWithToken(userId, accessToken),
        fetchNativeEditPetsWithToken(userId, accessToken),
        AsyncStorage.getItem(draftKey(mode, userId)),
      ]);
      const baseForm = mapRowToForm(data);
      const draftState = parseDraftPayload(rawDraft, data?.id, data?.updated_at);
      if (draftState.shouldClear) void AsyncStorage.removeItem(draftKey(mode, userId));
      const activePets = petsRows.filter((pet) => pet.is_active !== false);
      const petCount = activePets.length;
      const hasPets = petCount > 0;
      const petHeads = activePets.map((pet) => ({
        id: cleanString(pet.id),
        name: cleanString(pet.name) || null,
        species: cleanString(pet.species) || null,
        dob: cleanString(pet.dob) || null,
        photoUrl: cleanString(pet.photo_url) || null,
        is_public: pet.is_public !== false,
      }));
      const seededForm = {
        ...baseForm,
        owns_pets: hasPets ? true : baseForm.owns_pets,
        availability_status: enforceAvailabilityDefaults(baseForm.availability_status, hasPets || baseForm.owns_pets),
      };
      setProfileRow(data ?? null);
      const draftForm = draftState.draft ? (({ legal_name: _legalName, ...rest }) => rest)(draftState.draft) : null;
      const mergedForm = mergeDirtyDraft(seededForm, draftForm, draftState.dirtyFields);
      const nextForm = {
        ...mergedForm,
        owns_pets: hasPets ? true : mergedForm.owns_pets,
        availability_status: enforceAvailabilityDefaults(mergedForm.availability_status, hasPets || mergedForm.owns_pets),
      };
      if (__DEV__) {
        console.log("NATIVE_EDIT_PROFILE_FORM_MERGE", {
          seededDisplayName: baseForm.display_name || null,
          draftAccepted: Boolean(draftState.draft),
          draftCleared: draftState.shouldClear,
          dirtyFields: draftState.dirtyFields,
          finalDisplayName: nextForm.display_name || null,
        });
      }
      applyingHydrationRef.current = true;
      dirtyFieldsRef.current = new Set(draftState.dirtyFields);
      baseUpdatedAtRef.current = cleanString(data?.updated_at) || null;
      setForm(nextForm);
      applyingHydrationRef.current = false;
      hydratedRef.current = true;
      setLocationCoords(
        typeof data?.last_lat === "number" && typeof data?.last_lng === "number"
          ? { lat: data.last_lat, lng: data.last_lng }
          : null,
      );
      setPhoneOtpVerified(isCanonicalPhoneVerified(baseForm.phone, data?.phone, data?.phone_verification_status, data?.phone_verified_at));
      setActivePetCount(petCount);
      const loadedPublicProfile = await fetchNativePublicProfile({ accessToken, fallbackData: { ...(data ?? {}), pet_heads: petHeads }, userId });
      setPublicProfile(loadedPublicProfile);
    } catch (error) {
      loadFailedRef.current = true;
      setLoadFailed(true);
      hydratedRef.current = false;
      dirtyFieldsRef.current.clear();
      setMessage(error instanceof Error ? error.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, [ensureNativeEditProfileSession, mode, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const memberSince = cleanString(profileRow?.created_at);
    if (!memberSince) {
      setMemberNumber(null);
      return;
    }
    if (!liveAccessToken) {
      setMemberNumber(null);
      return;
    }
    let cancelled = false;
    void fetchNativeEditMemberNumberWithToken(liveAccessToken, memberSince)
      .then((count) => {
        if (!cancelled) setMemberNumber(count);
      });
    return () => {
      cancelled = true;
    };
  }, [liveAccessToken, profileRow?.created_at]);

  useEffect(() => {
    if (!form.phone.trim()) {
      setPhoneOtpVerified(false);
      setPhoneOtpRequested(false);
      setPhoneOtpCode("");
      setPhoneOtpMessage(null);
      setPhoneSentMaskedHint(null);
      setPhoneDuplicate(false);
      setPhoneDuplicateChecking(false);
      return;
    }
    const unchanged = normalizePhoneForCompare(form.phone) === normalizePhoneForCompare(originalPhone);
    if (unchanged) {
      setPhoneOtpVerified(isCanonicalPhoneVerified(form.phone, profileRow?.phone, profileRow?.phone_verification_status, profileRow?.phone_verified_at));
      setPhoneOtpRequested(false);
      setPhoneOtpCode("");
      setPhoneOtpMessage(null);
      setPhoneSentMaskedHint(null);
      setPhoneDuplicate(false);
      setPhoneDuplicateChecking(false);
      return;
    }
    setPhoneOtpVerified(false);
    setPhoneOtpRequested(false);
    setPhoneOtpCode("");
    setPhoneOtpUnavailable(false);
    setPhoneOtpMessage(null);
    setPhoneOtpTurnstileError("");
    setPhoneSentMaskedHint(null);
  }, [form.phone, originalPhone, profileRow?.phone, profileRow?.phone_verification_status, profileRow?.phone_verified_at]);

  useEffect(() => {
    setErrors((current) => clearResolvedFormErrors(current, form, activePetCount));
  }, [activePetCount, form]);

  useEffect(() => {
    const phone = form.phone.trim();
    const duplicateMessage = "This phone number is already used by another account";
    const invalidMessage = "Phone number is not complete or valid for the selected country.";
    if (!phoneRequiresVerification || !phone) {
      setErrors((current) => {
        if (current.phone !== invalidMessage && current.phone !== duplicateMessage) return current;
        const { phone: _phone, ...rest } = current;
        return rest;
      });
      return;
    }
    if (isValidPhoneNumber(phone)) {
      setErrors((current) => {
        if (current.phone !== invalidMessage) return current;
        const { phone: _phone, ...rest } = current;
        return rest;
      });
      return;
    }
    const timer = setTimeout(() => {
      setErrors((current) => ({ ...current, phone: invalidMessage }));
    }, 500);
    return () => clearTimeout(timer);
  }, [form.phone, phoneRequiresVerification]);

  useEffect(() => {
    const phone = form.phone.trim();
    if (!phoneRequiresVerification || !phone || !isValidPhoneNumber(phone)) {
      setPhoneDuplicate(false);
      setPhoneDuplicateChecking(false);
      setErrors((current) => {
        if (current.phone !== "This phone number is already used by another account") return current;
        const { phone: _phone, ...rest } = current;
        return rest;
      });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPhoneDuplicateChecking(true);
      try {
        const duplicate = await checkIdentifierRegistered("", phone);
        if (cancelled) return;
        setPhoneDuplicate(Boolean(duplicate?.registered));
        if (duplicate?.registered) {
          setErrors((current) => ({ ...current, phone: "This phone number is already used by another account" }));
        } else {
          setErrors((current) => {
            if (current.phone !== "This phone number is already used by another account") return current;
            const { phone: _phone, ...rest } = current;
            return rest;
          });
        }
      } catch {
        if (!cancelled) setPhoneDuplicate(false);
      } finally {
        if (!cancelled) setPhoneDuplicateChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.phone, phoneRequiresVerification]);

  useEffect(() => {
    if (phoneOtpCooldown <= 0) return;
    const timer = setInterval(() => {
      setPhoneOtpCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneOtpCooldown]);

  useEffect(() => {
    const query = form.location_district.trim();
    if (query.length < 2 || !locationSuggestionsOpen) {
      setLocationSuggestions([]);
      setLocationLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const suggestions = await fetchNativeLocationSuggestions(query, form.location_country);
        if (!cancelled) setLocationSuggestions(suggestions);
      } catch {
        if (!cancelled) setLocationSuggestions([]);
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.location_country, form.location_district, locationSuggestionsOpen]);

  const persistLocalDraft = async (nextForm: NativeProfileFormData = form) => {
    if (!userId) return;
    if (loadFailedRef.current) return;
    if (!hydratedRef.current || dirtyFieldsRef.current.size === 0) return;
    const draftForm = formToDraftData(nextForm);
    if (isEffectivelyEmptyDraft(draftForm)) return;
    const payload: NativeProfileDraftPayload = {
      version: PROFILE_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      baseUpdatedAt: baseUpdatedAtRef.current,
      sourceProfileId: cleanString(profileRow?.id) || userId,
      dirtyFields: Array.from(dirtyFieldsRef.current),
      form: draftForm,
    };
    await AsyncStorage.setItem(draftKey(mode, userId), JSON.stringify(payload));
  };

  const buildEditorialAlbum = (photos: NativeProfilePhotos) => canonicalizeNativeSocialAlbumEntries([
    photos.establishing,
    photos.pack,
    photos.solo,
    photos.closer,
  ].filter((item): item is string => Boolean(item)));

  const mergeProfilePhotosForPersist = (
    photos: NativeProfilePhotos,
    options: { preserveLiveCaptions?: boolean } = {},
  ): NativeProfilePhotos => {
    const latestPhotos: NativeProfilePhotos = {
      ...form.photos,
      ...photos,
    };
    if (!options.preserveLiveCaptions) return latestPhotos;
    return {
      ...latestPhotos,
      establishing_caption: form.photos.establishing_caption,
      pack_caption: form.photos.pack_caption,
      solo_caption: form.photos.solo_caption,
      closer_caption: form.photos.closer_caption,
    };
  };

  const persistProfilePhotos = async (
    photos: NativeProfilePhotos,
    options: { preserveLiveCaptions?: boolean } = {},
  ) => {
    if (!userId) {
      setMessage("Please sign in again to save your photos.");
      return;
    }
    if (loadFailedRef.current || !hydratedRef.current) {
      setMessage("Load your profile before saving photos.");
      return;
    }
    const latestPhotos = mergeProfilePhotosForPersist(photos, options);
    const nextPhotos = normalizeNativeProfilePhotos(latestPhotos);
    const nextSocialAlbum = buildEditorialAlbum(nextPhotos);
    try {
      const nextForm = { ...form, photos: nextPhotos, social_album: nextSocialAlbum };
      updateForm(nextForm);
      await persistLocalDraft(nextForm);
      if (mode === "onboarding") return;
      const accessToken = await ensureNativeEditProfileSession();
      const data = await updateNativeEditProfileWithToken(userId, accessToken, {
          photos: nextPhotos,
          avatar_url: getNativeProfilePhotoPublicUrl(nextPhotos.cover),
          social_album: nextSocialAlbum,
          updated_at: new Date().toISOString(),
        });
      [
        nextPhotos.cover,
        nextPhotos.establishing,
        nextPhotos.pack,
        nextPhotos.solo,
        nextPhotos.closer,
        ...nextSocialAlbum,
      ].forEach((value) => invalidateNativeProfileImageResolverCache(value, { defaultBucket: "profile_photos" }));

      const queuedDeletes = [...photoDeleteQueue];
      if (queuedDeletes.length > 0) {
        const deleteResults = await Promise.allSettled(queuedDeletes.map((path) => deleteNativeProfilePhotoPath(path)));
        deleteResults.forEach((result, index) => {
          if (result.status === "rejected") {
            logNativeProtectedActionFailure("[native.editProfile] profile_photo_delete_failed", result.reason);
          }
        });
        setPhotoDeleteQueue([]);
      }

      if (data) {
        setProfileRow(data as unknown as ProfileRow);
        await clearNativeProfileSummaryCache(userId);
      }
    } catch (error) {
      const uploadedPaths = [
        nextPhotos.cover,
        nextPhotos.establishing,
        nextPhotos.pack,
        nextPhotos.solo,
        nextPhotos.closer,
      ].filter((value): value is string => isNativeProfilePhotoStoragePath(value));
      const previousPaths = [
        form.photos.cover,
        form.photos.establishing,
        form.photos.pack,
        form.photos.solo,
        form.photos.closer,
      ].filter((value): value is string => isNativeProfilePhotoStoragePath(value));
      const orphanPaths = uploadedPaths.filter((path) => !previousPaths.includes(path));
      let cleanupResult: "queued" | "not_needed" | "failed" = orphanPaths.length > 0 ? "queued" : "not_needed";
      if (orphanPaths.length > 0) {
        const cleanupResults = await Promise.allSettled(orphanPaths.map((path) => deleteNativeProfilePhotoPath(path)));
        cleanupResults.forEach((result) => {
          if (result.status === "rejected") {
            cleanupResult = "failed";
            logNativeProtectedActionFailure("[native.editProfile] profile_photo_domain_save_cleanup_failed", createNativeProtectedActionError({
              ok: false,
              stage: "domain_save",
              originalError: error,
              cleanupAttempted: true,
              cleanupResult: "failed",
            }));
          }
        });
      }
      logNativeProtectedActionFailure("[native.editProfile] persist_profile_photos_failed", createNativeProtectedActionError({
        ok: false,
        stage: "domain_save",
        originalError: error,
        cleanupAttempted: orphanPaths.length > 0,
        cleanupResult,
      }));
      setMessage(error instanceof Error ? error.message : "Couldn't save profile photos.");
    }
  };

  useEffect(() => {
    if (!userId || loading || loadFailed) return;
    const timer = setTimeout(() => {
      void persistLocalDraft(form);
    }, 700);
    return () => clearTimeout(timer);
  }, [form, loadFailed, loading, mode, userId]);

  const saveDraft = async () => {
    if (!userId) {
      setMessage("Please sign in again to save your draft.");
      return;
    }
    if (loadFailedRef.current || !hydratedRef.current) {
      setMessage("Load your profile before saving a draft.");
      return;
    }
    setSaving(true);
    try {
      const accessToken = await ensureNativeEditProfileSession();
      await persistLocalDraft();
      if (mode === "onboarding") {
        setMessage("Draft saved");
        return;
      }
      const payload: Partial<NativeProfilePayload> = buildProfilePayload({ activePetCount, email, form, locationCoords, previousProfile: profileRow });
      if (!SOCIAL_ID_REGEX.test(form.social_id)) delete payload.social_id;
      if (!form.phone.trim() || !isValidPhoneNumber(form.phone.trim())) delete payload.phone;
      const phoneChangedWithoutVerification =
        savedPhoneVerified &&
        normalizePhoneForCompare(form.phone) !== normalizePhoneForCompare(originalPhone) &&
        !phoneOtpVerified;
      const data = await upsertNativeEditProfileWithToken(userId, accessToken, {
          ...payload,
          ...(phoneChangedWithoutVerification ? { phone_verification_status: "unverified", phone_verified_at: null } : {}),
          onboarding_completed: profileRow?.onboarding_completed ?? false,
        });
      setProfileRow(data as unknown as ProfileRow);
      await clearNativeProfileSummaryCache(userId);
      setMessage("Draft saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const silentSaveDraftForPreview = async () => {
    if (!userId) return;
    if (loadFailedRef.current || !hydratedRef.current) {
      setMessage("Load your profile before previewing it.");
      return;
    }
    await persistLocalDraft();
    const payload = buildProfilePayload({ activePetCount, email, form, locationCoords, previousProfile: profileRow });
    if (mode === "edit") {
      const accessToken = await ensureNativeEditProfileSession();
      const safePayload: Partial<NativeProfilePayload> = { ...payload };
      if (!SOCIAL_ID_REGEX.test(form.social_id)) delete safePayload.social_id;
      if (!form.phone.trim() || !isValidPhoneNumber(form.phone.trim())) delete safePayload.phone;
      await upsertNativeEditProfileWithToken(userId, accessToken, safePayload as Record<string, unknown>);
    }
    setPublicProfile(await mapNativePublicProfile({
      ...(profileRow ?? {}),
      ...payload,
      id: userId,
      pet_heads: publicProfile?.petHeads ?? [],
    }));
  };

  const handleUseCurrentLocation = async () => {
    setResolvingLocation(true);
    setMessage(null);
    try {
      const resolved = await resolveCurrentNativeLocation();
      setLocationCoords({ lat: resolved.lat, lng: resolved.lng });
      updateForm((previous) => ({
        ...previous,
        location_country: resolved.country || previous.location_country,
        location_district: resolved.district || previous.location_district,
        location_name: resolved.label || previous.location_name,
      }));
      setMessage("Location updated from your device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't resolve your current location.");
    } finally {
      setResolvingLocation(false);
    }
  };

  const handleRequestPhoneOtp = async () => {
    const phone = form.phone.trim();
    if (!phone || !isValidPhoneNumber(phone)) {
      setErrors((current) => ({ ...current, phone: "Enter a valid phone number." }));
      return;
    }
    if (!isNativePhoneCountryAllowed(phone)) {
      setPhoneOtpUnavailable(true);
      setPhoneOtpRequested(false);
      setPhoneOtpMessage("Phone verification is not available yet.");
      return;
    }
    if (!phoneOtpTurnstileToken.trim()) {
      setPhoneOtpTurnstileError("Complete the security check to send code.");
      return;
    }
    setPhoneOtpBusy(true);
    setPhoneOtpMessage(null);
    try {
      const duplicate = await checkIdentifierRegistered("", phone);
      if (duplicate?.registered) {
        setErrors((current) => ({ ...current, phone: "This phone number is already used by another account" }));
        return;
      }
      const result = await requestNativePhoneOtp(phone, phoneOtpTurnstileToken);
      if (!result.ok) {
        setPhoneOtpUnavailable(Boolean(result.unavailable));
        setPhoneOtpMessage(result.error || "Phone verification is temporarily unavailable. Please try again later.");
        return;
      }
      setPhoneOtpRequested(true);
      setPhoneOtpVerified(false);
      setPhoneOtpUnavailable(false);
      setPhoneOtpCooldown(result.cooldownSeconds || 90);
      setPhoneSentMaskedHint(maskNativePhoneForOtpNotice(phone));
      setPhoneOtpMessage(`Verification code sent to ${maskNativePhoneForOtpNotice(phone)}.`);
    } catch (error) {
      setPhoneOtpMessage(error instanceof Error ? error.message : "Phone verification is temporarily unavailable.");
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const phone = form.phone.trim();
    if (phoneOtpCode.length < 6) {
      setPhoneOtpMessage("Enter the 6-digit code.");
      return;
    }
    setPhoneOtpBusy(true);
    setPhoneOtpMessage(null);
    try {
      const result = await verifyNativePhoneOtp(phone, phoneOtpCode);
      if (!result.ok) {
        setPhoneOtpMessage(result.error || "We couldn't verify the code right now. Please try again.");
        return;
      }
      setPhoneOtpVerified(true);
      setPhoneOtpRequested(false);
      setPhoneOtpCode("");
      setPhoneSentMaskedHint(null);
      setPhoneOtpMessage("Phone verified.");
    } catch (error) {
      setPhoneOtpMessage(error instanceof Error ? error.message : "We couldn't verify the code right now. Please try again.");
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  useEffect(() => {
    const current = form.social_id.trim().toLowerCase();
    const original = cleanString(profileRow?.social_id).toLowerCase();
    if (!current) {
      setSocialIdStatus("idle");
      return;
    }
    if (!SOCIAL_ID_REGEX.test(current)) {
      setSocialIdStatus("idle");
      setErrors((currentErrors) => ({ ...currentErrors, social_id: "Social ID must be 6-15 characters" }));
      return;
    }
    if (current === original) {
      setSocialIdStatus("available");
      setErrors((currentErrors) => {
        if (!currentErrors.social_id) return currentErrors;
        const { social_id: _socialId, ...rest } = currentErrors;
        return rest;
      });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSocialIdStatus("checking");
      try {
        const taken = await checkSocialIdTaken(current);
        if (cancelled) return;
        setSocialIdStatus(taken ? "taken" : "available");
        setErrors((currentErrors) => {
          if (taken) return { ...currentErrors, social_id: "Oops! This Social ID was taken." };
          if (!currentErrors.social_id) return currentErrors;
          const { social_id: _socialId, ...rest } = currentErrors;
          return rest;
        });
      } catch {
        if (!cancelled) {
          setSocialIdStatus("failed");
          setErrors((currentErrors) => ({ ...currentErrors, social_id: "Oops! We couldn't check Social ID. Try again." }));
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.social_id, profileRow?.social_id]);

  const confirmPhoneVerificationReset = async () => {
    if (!shouldConfirmPhoneVerificationReset) return true;
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        "Save without phone verification?",
        "Changing your number without verifying it will remove your verified status.",
        [
          { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
          { text: "Save anyway", style: "destructive", onPress: () => resolve(true) },
        ],
      );
    });
  };

  const handlePhoneInlineSave = async () => {
    return confirmPhoneVerificationReset();
  };

  const saveProfile = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!userId) {
      setMessage("Please sign in again to save your profile.");
      return false;
    }
    if (loadFailedRef.current || !hydratedRef.current) {
      setMessage("Load your profile before saving.");
      return false;
    }
    const nextErrors = validateForm(form, activePetCount);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (!silent) {
        haptic.warning();
        triggerSaveShake();
        setMessage(firstValidationMessage(nextErrors));
        setErrorFocusRequest((current) => current + 1);
      }
      return false;
    }
    setSaving(true);
    try {
      const accessToken = await ensureNativeEditProfileSession();
      const socialTaken = await checkSocialIdTaken(form.social_id);
      if (socialTaken && form.social_id.toLowerCase() !== cleanString(profileRow?.social_id).toLowerCase()) {
        setErrors((current) => ({ ...current, social_id: "Please use an available Social ID before saving" }));
        return false;
      }
      if (form.phone.trim() !== cleanString(profileRow?.phone) && !phoneOtpVerified) {
        const identifier = await checkIdentifierRegistered("", form.phone.trim());
        if (identifier?.registered) {
          setErrors((current) => ({ ...current, phone: "This phone number is already used by another account" }));
          return false;
        }
      }
      if (!(await confirmPhoneVerificationReset())) return false;
      const shouldRevokePhoneVerification =
        savedPhoneVerified &&
        normalizePhoneForCompare(form.phone) !== normalizePhoneForCompare(originalPhone) &&
        !phoneOtpVerified;
      const payload = buildProfilePayload({ activePetCount, email, form, locationCoords, previousProfile: profileRow });
      const data = await upsertNativeEditProfileWithToken(userId, accessToken, {
          ...payload,
          ...(shouldRevokePhoneVerification ? { phone_verification_status: "unverified", phone_verified_at: null } : {}),
          onboarding_completed: mode === "onboarding" ? true : profileRow?.onboarding_completed ?? false,
          email_verified: mode === "onboarding" ? true : profileRow?.email_verified ?? true,
        });
      let savedProfile = data as unknown as ProfileRow;
      if (phoneOtpVerified) {
        try {
          await callNativeEditRpcWithToken(accessToken, "refresh_phone_verification_status", { p_user_id: userId });
        } catch {
          // Phone OTP verification already succeeded; refresh is a best-effort parity sync.
        }
      }
      if (mode === "onboarding") {
        const passedHumanAttemptUrl = new URL(`${supabaseUrl}/rest/v1/human_verification_attempts`);
        passedHumanAttemptUrl.searchParams.set("user_id", `eq.${userId}`);
        passedHumanAttemptUrl.searchParams.set("status", "eq.passed");
        passedHumanAttemptUrl.searchParams.set("select", "created_at");
        passedHumanAttemptUrl.searchParams.set("order", "created_at.desc");
        passedHumanAttemptUrl.searchParams.set("limit", "1");
        const passedHumanResult = await parseNativeEditRestResponse<Array<Record<string, unknown>>>(await fetch(passedHumanAttemptUrl.toString(), {
          method: "GET",
          headers: nativeEditAuthHeaders(accessToken),
        }));
        const passedHumanAttempt = firstRow<Record<string, unknown>>(passedHumanResult.data);
        if (passedHumanAttempt) {
          await updateNativeEditProfileWithToken(userId, accessToken, {
              human_verification_status: "passed",
              human_verified_at: passedHumanAttempt.created_at,
              is_verified: true,
              verification_status: "verified",
            });
        }
        await Promise.allSettled([
          callNativeEditRpcWithToken(accessToken, "refresh_identity_verification_status", { p_user_id: userId }),
          callNativeEditRpcWithToken(accessToken, "refresh_phone_verification_status", { p_user_id: userId }),
        ]);
        savedProfile = await fetchNativeEditProfileRowWithToken(userId, accessToken);
      }
      await AsyncStorage.removeItem(draftKey(mode, userId));
      await clearNativeProfileSummaryCache(userId);
      await writeNativeProfileSummaryCache(userId, { profile: savedProfile, quota: null }, { sessionKey });
      await Promise.allSettled(photoDeleteQueue.map((path) => deleteNativeProfilePhotoPath(path)));
      setPhotoDeleteQueue([]);
      setProfileRow(savedProfile);
      dirtyFieldsRef.current.clear();
      baseUpdatedAtRef.current = cleanString(savedProfile.updated_at) || baseUpdatedAtRef.current;
      setPublicProfile(await mapNativePublicProfile({ ...savedProfile, pet_heads: publicProfile?.petHeads ?? [] }));
      if (!silent) {
        haptic.success();
        setMessage(mode === "onboarding" ? "Profile completed successfully." : "Profile updated");
      }
      if (mode === "onboarding") {
        const shouldSetPet = activePetCount > 0 || form.owns_pets === true;
        onNavigate(
          shouldSetPet ? "/set-pet" : "/",
          shouldSetPet ? { refreshOnboarding: true } : { preserveHistory: false, refreshOnboarding: true },
        );
      }
      return true;
    } catch (error) {
      haptic.error();
      setMessage(error instanceof Error ? error.message : "Failed to update profile.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const scrollNativeProfileFieldIntoView = useCallback((target?: number | null) => {
    if (!target) return;

    UIManager.measureInWindow(target, (_x, y, _width, height) => {
      const windowHeight = Dimensions.get("window").height;
      const desiredY = Math.max(huddleLayout.headerHeight + huddleSpacing.x5, (windowHeight - height) / 2);
      const nextY = Math.max(0, editScrollYRef.current + y - desiredY);

      editScrollRef.current?.scrollTo({ y: nextY, animated: true });
    });
  }, []);

  const previewProfile = useMemo(() => publicProfile, [publicProfile]);
  const onboardingEditMode = mode === "onboarding" && viewMode === "edit";

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={huddleColors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.message}>{message || "We couldn't load your profile. Please try again."}</Text>
          <Pressable onPress={() => void loadProfile()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={[styles.header, { marginTop: 0, paddingTop: huddleLayout.headerHeight + huddleSpacing.x3 }]}>
          <Pressable accessibilityLabel="Back" onPress={onGoBack} style={styles.backButton}>
            <Feather color={huddleColors.iconMuted} name="chevron-left" size={26} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tell us about you</Text>
            <Text style={styles.subtitle}>Customize how you appear to the community</Text>
          </View>
          {viewMode === "edit" ? (
            <Animated.View style={{ transform: [{ translateX: saveShakeAnim }] }}>
            <Pressable
              accessibilityLabel="Save"
              disabled={saving}
              onPress={() => void saveProfile()}
              style={({ pressed }) => [
                styles.headerSaveButton,
                pressed && !saving ? styles.pressed : null,
                saving ? styles.disabled : null,
              ]}
            >
              {saving ? <ActivityIndicator color={huddleColors.text} size="small" /> : <Feather color={huddleColors.text} name="save" size={20} />}
            </Pressable>
            </Animated.View>
          ) : <View style={styles.headerSaveSlot} />}
        </View>
        <View style={styles.tabWrap}>
          <Pressable onPress={() => setViewMode("edit")} style={[styles.tabButton, viewMode === "edit" ? styles.tabButtonActive : null]}>
            <Text style={[styles.tabText, viewMode === "edit" ? styles.tabTextActive : null]}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => void silentSaveDraftForPreview().finally(() => {
              setViewMode("view");
              setTimeout(() => previewScrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
            })}
            style={[styles.tabButton, viewMode === "view" ? styles.tabButtonActive : null]}
          >
            <Text style={[styles.tabText, viewMode === "view" ? styles.tabTextActive : null]}>View</Text>
          </Pressable>
        </View>
        {viewMode === "edit" ? (
          <ScrollView
            ref={editScrollRef}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (onboardingEditMode ? 132 : 24) }]}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              editScrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.contentScroller}
          >
            <NativeProfileForm
              activePetCount={activePetCount}
              email={email}
              errorFocusRequest={errorFocusRequest}
              errors={errors}
              form={form}
              accessToken={liveAccessToken}
              mode={mode}
              onChange={updateForm}
              onError={setMessage}
              profileVerified={isNativeVerifiedProfile(profileRow)}
              onPreviousPhotoPathQueued={(path) => {
                if (isNativeProfilePhotoStoragePath(path)) setPhotoDeleteQueue((current) => current.includes(path) ? current : [...current, path]);
              }}
              onProfilePhotoCaptionAutosave={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos)}
              onProfilePhotoCaptionCommit={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos)}
              onProfilePhotosCommit={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos, { preserveLiveCaptions: true })}
              onPhoneInlineSave={handlePhoneInlineSave}
              onPhoneOtpCodeChange={setPhoneOtpCode}
              onPhoneOtpRequest={() => void handleRequestPhoneOtp()}
              onPhoneOtpVerify={() => void handleVerifyPhoneOtp()}
              locationLoading={locationLoading}
              locationSuggestions={locationSuggestions}
              locationSuggestionsOpen={locationSuggestionsOpen}
              onLocationFocusChange={setLocationSuggestionsOpen}
              onLocationSuggestionSelect={(item) => {
                setLocationCoords({ lat: item.lat, lng: item.lng });
                setLocationSuggestions([]);
                setLocationSuggestionsOpen(false);
                updateForm((previous) => ({
                  ...previous,
                  location_country: item.country || previous.location_country,
                  location_district: item.district || previous.location_district,
                  location_name: `${item.district || previous.location_district}${item.country ? `, ${item.country}` : previous.location_country ? `, ${previous.location_country}` : ""}`.trim(),
                }));
              }}
              onUseCurrentLocation={() => void handleUseCurrentLocation()}
              phoneOtpBusy={phoneOtpBusy}
              phoneOtpCode={phoneOtpCode}
              phoneOtpCooldown={phoneOtpCooldown}
              phoneOtpCanRequest={Boolean(phoneOtpTurnstileToken.trim() && form.phone.trim() && isValidPhoneNumber(form.phone.trim()) && !phoneDuplicate && !phoneDuplicateChecking)}
              phoneOtpDuplicate={phoneDuplicate}
              phoneOtpDuplicateChecking={phoneDuplicateChecking}
              phoneOtpMessage={getHumanPhoneOtpMessage(phoneOtpMessage || phoneOtpTurnstileError)}
              phoneOtpRequested={phoneOtpRequested}
              phoneSentMaskedHint={phoneSentMaskedHint}
              phoneOtpTurnstile={
                phoneRequiresVerification ? (
                  <NativeTurnstile
                    action="send_pre_signup_verify"
                    onError={setPhoneOtpTurnstileError}
                    onToken={(token) => {
                      setPhoneOtpTurnstileToken(token);
                      if (token) setPhoneOtpTurnstileError("");
                    }}
                    siteKey={turnstileSiteKey}
                  />
                ) : null
              }
              phoneOtpUnavailable={phoneOtpUnavailable}
              phoneOtpVerified={phoneOtpVerified}
              phoneRequiresVerification={phoneRequiresVerification}
              savedPhoneVerified={savedPhoneVerified}
              resolvingLocation={resolvingLocation}
              socialIdStatus={socialIdStatus}
              onDropdownOpen={(_, target) => {
                setTimeout(() => scrollNativeProfileFieldIntoView(target), 80);
              }}
              userId={userId}
            />
          </ScrollView>
        ) : previewProfile ? (
          <ScrollView ref={previewScrollRef} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} style={styles.contentScroller}>
            <NativePublicProfileContent memberNumber={memberNumber} profile={previewProfile} />
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <Text style={styles.message}>Save your profile before previewing it.</Text>
          </View>
        )}
        {onboardingEditMode ? (
          <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + huddleSpacing.x3 }]}>
            <Animated.View style={{ transform: [{ translateX: saveShakeAnim }] }}>
              <Pressable disabled={saving} onPress={() => void saveProfile()} style={[styles.primaryButton, saving ? styles.disabled : null]}>
                <Text style={styles.primaryButtonText}>{saving ? "Saving..." : "Complete profile"}</Text>
              </Pressable>
            </Animated.View>
            <Pressable disabled={saving} onPress={saveDraft} style={[styles.secondaryButton, saving ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>Save draft</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  keyboard: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: huddleSpacing.x5,
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
  headerText: {
    flex: 1,
  },
  headerSaveSlot: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 26,
    color: huddleColors.text,
  },
  subtitle: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 17,
    marginTop: 2,
  },
  headerSaveButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
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
    fontFamily: "Urbanist-600",
    fontSize: 14,
    color: huddleColors.mutedText,
  },
  tabTextActive: {
    color: huddleColors.text,
  },
  message: {
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  content: {
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x5,
  },
  contentScroller: {
    backgroundColor: huddleColors.canvas,
  },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.ghost,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  secondaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  disabled: {
    opacity: 0.56,
  },
  pressed: {
    opacity: 0.78,
  },
});
