import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { Feather } from "@expo/vector-icons";
import { isValidPhoneNumber } from "libphonenumber-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Dimensions, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from "react-native";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeToast } from "../components/NativeToast";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { AppConfirmModal, AppKeyboardAvoidingView as KeyboardAvoidingView } from "../components/nativeModalPrimitives";
import {
  emptyNativeProfileFormData,
  NativeProfileForm,
  nativeAvailabilityOptions,
  type NativeIdentityCooldown,
  type NativeProfileFormData,
  type NativeProfileFormErrors,
} from "../components/profile/NativeProfileForm";
import { NativePublicProfileContent } from "../components/profile/NativePublicProfileContent";
import { NativeShareCardModal } from "../components/share/NativeShareCardModal";
import { NativeGlassSurface } from "../components/NativeGlassSurface";
import { buildProfileShareCard } from "../lib/shareCardData";
import {
  canonicalizeNativeSocialAlbumEntries,
  fetchNativePublicProfile,
  invalidateNativePublicProfileCaches,
  mapNativePublicProfile,
  type NativePublicProfile,
} from "../lib/nativePublicProfile";
import { purgeNativeSocialPersistentCache } from "../lib/nativeSocial";
import {
  clearNativeProfilePhotoPublicUrlCache,
  deleteNativeProfilePhotoPath,
  getNativeProfilePhotoPublicUrl,
  isNativePersistableStoragePath,
  isNativeProfilePhotoStoragePath,
  normalizeNativeProfilePhotos,
  sanitizeNativeProfilePhotosForDraft,
  type NativeProfilePhotos,
} from "../lib/nativeProfilePhotos";
import { invalidateNativeProfileImageResolverCache } from "../lib/nativeStorageUrlCache";
import { createNativeProtectedActionError, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../lib/nativeStorageCleanup";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { isCurrentNativeSessionKey, requireCurrentNativeSession } from "../lib/nativeSessionGuard";
import {
  fetchNativePrioritizedLocationSuggestions,
  normalizeNativeLocationTextFields,
  type NativeLocationSuggestion,
  type NativeResolvedLocation,
} from "../lib/nativeLocation";
import {
  isNativePhoneCountryAllowed,
  maskNativePhoneForOtpNotice,
  requestNativePhoneOtp,
  verifyNativePhoneOtp,
} from "../lib/nativePhoneOtp";
import { clearNativeProfileSummaryCache, patchNativeProfileSummaryCache, writeNativeProfileSummaryCache } from "../lib/nativeProfileSummary";
import { formatNativePetJourney } from "../lib/nativePetEmoji";
import { freshnessRegistry } from "../lib/nativeFreshnessRegistry";
import { checkIdentifierRegistered, checkSocialIdTaken } from "../lib/nativeSignup";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { fetchNativeVerifyIdentityProfileStatus, type NativeVerifyIdentityProfileStatus } from "../lib/nativeVerifyIdentity";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { haptic } from "../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { cacheNativeAvatarPresentation } from "../lib/nativeAvatarPresentation";
import { buildNativeProfileAreaCity, resolveNativeProfileMarketCity } from "../lib/nativeProfileLocation";
import { useErrorShake } from "../components/motion/useErrorShake";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import {
  huddleButtons,
  huddleColors,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";


type NativeEditProfileScreenProps = {
  accessToken?: string | null;
  focusField?: string | null;
  initialSession?: Session | null;
  mode?: "edit" | "onboarding";
  onCareLocationSaved?: () => void | Promise<void>;
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
  "display_name_changed_at",
  "social_id_changed_at",
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
const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const SOCIAL_ID_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const draftKey = (mode: "edit" | "onboarding", userId: string, sessionKey?: string | null) =>
  `huddle_native_${mode}_profile_draft:${userId}:${cleanString(sessionKey) || `${userId}:0`}`;
const PROFILE_DRAFT_VERSION = 2;
const PROFILE_FORM_FIELDS = Object.keys(emptyNativeProfileFormData()) as Array<keyof NativeProfileFormData>;
const normalizePhoneForCompare = (phone: string): string => String(phone || "").trim().replace(/[^\d+]/g, "");
const getSessionUserId = (session: Session | null | undefined) => cleanString(session?.user?.id);
const getSessionAccessToken = (session: Session | null | undefined) => cleanString(session?.access_token);
const formatCooldownDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const buildIdentityCooldown = (
  changedAt: unknown,
  cooldownDays: number,
  label: "Display name" | "Social ID",
): NativeIdentityCooldown => {
  const baseCopy = `${label} can be changed once every ${cooldownDays} days.`;
  const changedAtText = cleanString(changedAt);
  const changedAtMs = changedAtText ? Date.parse(changedAtText) : NaN;
  if (!Number.isFinite(changedAtMs)) {
    return { helperText: baseCopy, locked: false, lockedMessage: baseCopy };
  }

  const unlockAt = new Date(changedAtMs + cooldownDays * DAY_MS);
  const locked = unlockAt.getTime() > Date.now();
  const lockedMessage = locked
    ? `${baseCopy} You can change it again after ${formatCooldownDate(unlockAt)}.`
    : baseCopy;
  return {
    helperText: lockedMessage,
    locked,
    lockedMessage,
  };
};
const nativeEditAuthHeaders = (accessToken: string, extra?: Record<string, string>) =>
  createNativeAuthenticatedHeaders(accessToken, extra);
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
  url.searchParams.set("select", "id,name,species,dob,photo_url,photo_presentation,is_public,is_active");
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
const saveNativeEditProfileWithToken = updateNativeEditProfileWithToken;
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
  return nativeSafeErrorCopy(raw, "Phone verification is temporarily unavailable. Please try again later.");
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
  if (!isValidIsoDate(isoDate)) return false;
  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 13;
};

const pad2 = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const isoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
const isValidIsoDate = (value: string) => {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  return isoFromParts(year, month, day) === text;
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
  const degree = cleanString(row.degree);
  const school = cleanString(row.school);
  const major = cleanString(row.major);
  const gender = cleanString(row.gender_genre);
  const height = row.height == null ? "" : String(row.height);
  const weight = row.weight == null ? "" : String(row.weight);
  const affiliation = cleanString(row.affiliation);
  const occupation = cleanString(row.occupation);
  const orientation = cleanString(row.orientation);
  const relationshipStatus = cleanString(row.relationship_status);
  const languages = isStringArray(row.languages) ? row.languages : [];
  const locationCountry = cleanString(row.location_country);
  const locationDistrict = cleanString(row.location_district);
  const dob = cleanString(row.dob);
  return {
    ...form,
    affiliation,
    availability_status: isStringArray(row.availability_status) ? sanitizeAvailabilityStatus(row.availability_status) : [],
    bio,
    degree,
    display_name: cleanString(row.display_name),
    dob,
    experience_years: row.experience_years == null ? "" : String(row.experience_years),
    gender_genre: gender,
    has_car: row.has_car === true,
    height,
    languages,
    legal_name: cleanString(row.legal_name),
    location_country: locationCountry,
    location_district: locationDistrict,
    location_name: cleanString(row.location_name),
    major,
    occupation,
    orientation,
    owns_pets: row.owns_pets === true,
    pet_experience: isStringArray(row.pet_experience) ? row.pet_experience : [],
    phone: cleanString(row.phone),
    photos: normalizeNativeProfilePhotos(row.photos, { avatarUrl: cleanString(row.avatar_url), socialAlbum }),
    relationship_status: relationshipStatus,
    school,
    show_academic: Boolean(row.show_academic === true && (degree || school || major)),
    show_affiliation: Boolean(row.show_affiliation === true && affiliation),
    show_age: Boolean(row.show_age === true && dob),
    show_bio: Boolean((row.show_bio ?? Boolean(bio)) && bio),
    show_gender: Boolean(row.show_gender === true && gender),
    show_height: Boolean(row.show_height === true && height),
    show_languages: Boolean(prefs.show_languages === true && languages.length > 0),
    show_location: Boolean(prefs.show_location === true && locationCountry && locationDistrict),
    show_occupation: Boolean(row.show_occupation === true && occupation),
    show_orientation: Boolean(row.show_orientation === true && orientation),
    show_relationship_status: Boolean(row.show_relationship_status === true && relationshipStatus),
    show_weight: Boolean(row.show_weight === true && weight),
    social_album: socialAlbum,
    social_id: cleanString(row.social_id),
    weight,
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
  form,
  previousProfile,
}: {
  activePetCount: number;
  form: NativeProfileFormData;
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
  const locationCity = resolveNativeProfileMarketCity({
    country: locationCountry,
    district: locationDistrict,
    locationName: form.location_name,
  }) || cleanString(previousProfile?.location_city) || null;

  return {
    affiliation: form.affiliation || null,
    availability_status: enforceAvailabilityDefaults(sanitizeAvailabilityStatus(form.availability_status), hasPets),
    avatar_url: getNativeProfilePhotoPublicUrl(photos.cover),
    bio: form.bio,
    degree: form.degree || null,
    display_name: form.display_name.trim(),
    experience_years: form.pet_experience.includes("None") || !form.experience_years ? null : parseFloat(form.experience_years),
    gender_genre: form.gender_genre || null,
    has_car: form.has_car,
    height: form.height ? parseInt(form.height, 10) : null,
    languages: form.languages.length > 0 ? form.languages : null,
    location_country: locationCountry,
    location_city: locationCity,
    location_district: locationDistrict,
    location_name: form.location_name || `${locationDistrict || ""}${locationCountry ? `, ${locationCountry}` : ""}`.trim() || null,
    major: form.major || null,
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
    weight: form.weight ? parseFloat(form.weight) : null,
    weight_unit: form.weight_unit,
  };
};

const profilePayloadForSave = (
  payload: NativeProfilePayload,
  includeIdentity: boolean,
): Partial<NativeProfilePayload> => {
  if (includeIdentity) return payload;
  const safePayload: Partial<NativeProfilePayload> = { ...payload };
  delete safePayload.phone;
  delete safePayload.social_id;
  return safePayload;
};

const validateForm = (form: NativeProfileFormData, activePetCount: number, includeIdentity: boolean): NativeProfileFormErrors => {
  const errors: NativeProfileFormErrors = {};
  const hasPets = activePetCount > 0 || form.owns_pets;
  if (!form.photos.cover) errors.photos = "Main photo is required";
  if (!form.display_name.trim()) errors.display_name = REQUIRED_CONNECT_ERROR;
  if (includeIdentity) {
    if (!form.phone.trim()) errors.phone = REQUIRED_CONNECT_ERROR;
    else if (!isValidPhoneNumber(form.phone.trim())) errors.phone = "Your phone number is invalid";
    if (!form.dob) errors.dob = REQUIRED_CONNECT_ERROR;
    else if (!isValidIsoDate(form.dob) || new Date(`${form.dob}T00:00:00`) > new Date()) errors.dob = "Human DOB must be a valid calendar date.";
    else if (!isAtLeast13FromDate(form.dob)) errors.dob = "You must be at least 13 years old to use huddle.";
    if (!form.social_id.trim()) errors.social_id = REQUIRED_CONNECT_ERROR;
    else if (!SOCIAL_ID_REGEX.test(form.social_id)) errors.social_id = "Social ID must be 6-15 characters";
  }
  // Gender is optional (Apple Guideline 5.1.1(v)): request it, never require it.
  if (!form.location_country.trim() || !form.location_district.trim()) errors.location = REQUIRED_CONNECT_ERROR;
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
  includeIdentity: boolean,
): NativeProfileFormErrors => {
  const validated = validateForm(form, activePetCount, includeIdentity);
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

export function NativeEditProfileScreen({
  accessToken,
  focusField,
  initialSession,
  mode = "edit",
  onCareLocationSaved,
  onGoBack,
  onNavigate,
  sessionKey,
  userId,
}: NativeEditProfileScreenProps) {
  const [form, setForm] = useState<NativeProfileFormData>(() => emptyNativeProfileFormData());
  const formRef = useRef(form);
  const profilePhotoPersistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [errors, setErrors] = useState<NativeProfileFormErrors>({});
  const [errorFocusRequest, setErrorFocusRequest] = useState(0);
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [identityProfileStatus, setIdentityProfileStatus] = useState<NativeVerifyIdentityProfileStatus | null>(null);
  const [activePetCount, setActivePetCount] = useState(0);
  const [publicProfile, setPublicProfile] = useState<NativePublicProfile | null>(null);
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setLoadFailed(true);
      setMessage("Your profile is taking too long to load. Please try again.");
    },
  });
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [petProfilePromptOpen, setPetProfilePromptOpen] = useState(false);
  const [phoneVerificationResetPromptOpen, setPhoneVerificationResetPromptOpen] = useState(false);
  const phoneVerificationResetResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveToastMessage, setSaveToastMessage] = useState<string | null>(null);
  const identitySaveRequested = mode === "onboarding" || String(focusField || "").trim() === "identity";
  const { shake: triggerSaveShake, shakeStyle: saveShakeStyle } = useErrorShake("warning");
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit");
  const [photoDeleteQueue, setPhotoDeleteQueue] = useState<string[]>([]);
  const photoDeleteQueueRef = useRef<string[]>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSuggestionsOpen, setLocationSuggestionsOpen] = useState(false);
  const [manualLocationAllowedQuery, setManualLocationAllowedQuery] = useState<string | null>(null);
  const acceptedLocationRef = useRef<string | null>(null);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpMessage, setPhoneOtpMessage] = useState<string | null>(null);
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);
  const [phoneOtpUnavailable, setPhoneOtpUnavailable] = useState(false);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);
  const [phoneOtpTurnstileToken, setPhoneOtpTurnstileToken] = useState("");
  const [phoneOtpTurnstileError, setPhoneOtpTurnstileError] = useState("");
  const [phoneOtpTurnstileResetKey, setPhoneOtpTurnstileResetKey] = useState(0);
  const [phoneSentMaskedHint, setPhoneSentMaskedHint] = useState<string | null>(null);
  const [phoneDuplicate, setPhoneDuplicate] = useState(false);
  const [phoneDuplicateChecking, setPhoneDuplicateChecking] = useState(false);
  const [socialIdStatus, setSocialIdStatus] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  // Deep-link entry into a focused editor (e.g. Account identity rows navigate
  // to /edit-profile?focus=identity). Nonce re-fires on repeat navigations.
  const [editorRequest, setEditorRequest] = useState<{ editor: string; nonce: number } | null>(null);
  const editorRequestNonceRef = useRef(0);
  const editScrollRef = useRef<ScrollView | null>(null);
  const editScrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const previewScrollRef = useRef<ScrollView | null>(null);
  const hydratedRef = useRef(false);
  const loadFailedRef = useRef(false);
  const applyingHydrationRef = useRef(false);

  useEffect(() => {
    const editor = String(focusField || "").trim();
    if (!editor) return;
    editorRequestNonceRef.current += 1;
    setEditorRequest({ editor, nonce: editorRequestNonceRef.current });
  }, [focusField]);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const dirtyFieldsRef = useRef<Set<keyof NativeProfileFormData>>(new Set());
  const insets = useSafeAreaInsets();
  const liveAccessToken = cleanString(accessToken) || getSessionAccessToken(initialSession);
  const sessionKeyRef = useRef<string | null>(sessionKey ?? null);

  useEffect(() => {
    sessionKeyRef.current = sessionKey ?? null;
  }, [sessionKey]);

  useEffect(() => {
    setIdentityProfileStatus(null);
  }, [sessionKey, userId]);

  const requireProfileSession = useCallback(() => (
    requireCurrentNativeSession({
      accessToken: liveAccessToken,
      expectedUserId: userId,
      session: initialSession,
      sessionKey,
    })
  ), [initialSession, liveAccessToken, sessionKey, userId]);

  const ensureNativeEditProfileSession = useCallback(async () => {
    const nativeSession = requireProfileSession();
    const initialSessionUserId = getSessionUserId(initialSession);
    const matched = Boolean(userId && initialSessionUserId === nativeSession.userId && nativeSession.accessToken && initialSession?.refresh_token);
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
    if (!matched) {
      throw new Error("Please sign in again to edit your profile.");
    }
    const freshAccessToken = await getFreshNativeAccessToken(nativeSession.accessToken);
    if (!freshAccessToken) throw new Error("Please sign in again to edit your profile.");
    return freshAccessToken;
  }, [initialSession, requireProfileSession, userId]);

  const refreshIdentityProfileStatus = useCallback(async () => {
    try {
      const nativeSession = requireProfileSession();
      const status = await fetchNativeVerifyIdentityProfileStatus({
        force: true,
        sessionKey: nativeSession.sessionKey,
        userId: nativeSession.userId,
      });
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, nativeSession.sessionKey)) return;
      setIdentityProfileStatus(status);
    } catch {
      // The core profile remains usable offline. Optional document-derived rows
      // simply remain absent until the next explicit Identity & account entry.
      setIdentityProfileStatus(null);
    }
  }, [requireProfileSession]);

  const updateForm = useCallback((next: NativeProfileFormData | ((previous: NativeProfileFormData) => NativeProfileFormData)) => {
    setForm((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      if (hydratedRef.current && !applyingHydrationRef.current) {
        PROFILE_FORM_FIELDS.forEach((field) => {
          if (!valuesEqual(previous[field], resolved[field])) dirtyFieldsRef.current.add(field);
        });
      }
      formRef.current = resolved;
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
      const nativeSession = requireProfileSession();
      const requestSessionKey = nativeSession.sessionKey;
      const accessToken = await ensureNativeEditProfileSession();
      const [data, petsRows, rawDraft] = await Promise.all([
        fetchNativeEditProfileRowWithToken(nativeSession.userId, accessToken),
        fetchNativeEditPetsWithToken(nativeSession.userId, accessToken),
        AsyncStorage.getItem(draftKey(mode, nativeSession.userId, nativeSession.sessionKey)),
      ]);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return;
      const baseForm = mapRowToForm(data);
      const draftState = parseDraftPayload(rawDraft, data?.id, data?.updated_at);
      if (draftState.shouldClear) void AsyncStorage.removeItem(draftKey(mode, nativeSession.userId, nativeSession.sessionKey));
      const activePets = petsRows.filter((pet) => pet.is_active !== false);
      const petCount = activePets.length;
      const hasPets = petCount > 0;
      const petHeads = activePets.map((pet) => ({
        id: cleanString(pet.id),
        name: cleanString(pet.name) || null,
        species: cleanString(pet.species) || null,
        dob: cleanString(pet.dob) || null,
        photoUrl: cleanString(pet.photo_url) || null,
        photoPosition: (() => {
          const presentation = pet.photo_presentation;
          if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
          const home = (presentation as { home?: unknown }).home;
          if (!home || typeof home !== "object" || Array.isArray(home)) return null;
          const { centerX, centerY, widthPct, sourceAspect } = home as { centerX?: unknown; centerY?: unknown; widthPct?: unknown; sourceAspect?: unknown };
          return typeof centerX === "number" && typeof centerY === "number" ? { centerX, centerY, widthPct: typeof widthPct === "number" ? widthPct : 100, ...(typeof sourceAspect === "number" ? { sourceAspect } : {}) } : null;
        })(),
        is_public: pet.is_public !== false,
      }));
      const seededForm = {
        ...baseForm,
        owns_pets: hasPets ? true : baseForm.owns_pets,
        availability_status: enforceAvailabilityDefaults(baseForm.availability_status, hasPets || baseForm.owns_pets),
      };
      setProfileRow(data ?? null);
      const identityLocked = Boolean(cleanString(data?.dob));
      const draftForm = draftState.draft
        ? identityLocked
          ? (({ dob: _dob, legal_name: _legalName, ...rest }) => rest)(draftState.draft)
          : (({ legal_name: _legalName, ...rest }) => rest)(draftState.draft)
        : null;
      const dirtyFields = identityLocked
        ? draftState.dirtyFields.filter((field) => field !== "dob" && field !== "legal_name")
        : draftState.dirtyFields.filter((field) => field !== "legal_name");
      const mergedForm = mergeDirtyDraft(seededForm, draftForm, dirtyFields);
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
      formRef.current = nextForm;
      setForm(nextForm);
      acceptedLocationRef.current = nextForm.location_district.trim() || null;
      setManualLocationAllowedQuery(null);
      applyingHydrationRef.current = false;
      hydratedRef.current = true;
      setLocationCoords(
        typeof data?.last_lat === "number" && typeof data?.last_lng === "number"
          ? { lat: data.last_lat, lng: data.last_lng }
          : null,
      );
      setPhoneOtpVerified(isCanonicalPhoneVerified(baseForm.phone, data?.phone, data?.phone_verification_status, data?.phone_verified_at));
      setActivePetCount(petCount);
      const publicProfileFallback = { ...(data ?? {}), pet_heads: petHeads };
      // Public-profile enrichment powers Preview, but it must never prevent the
      // owner from opening Edit Profile after the canonical row has loaded.
      // Network/RPC/cache failures here degrade to the already-loaded row.
      let loadedPublicProfile: NativePublicProfile | null = null;
      try {
        loadedPublicProfile = await fetchNativePublicProfile({
          accessToken,
          fallbackData: publicProfileFallback,
          force: true,
          profileUserId: nativeSession.userId,
          requireCanonical: true,
        });
      } catch (error) {
        if (__DEV__) console.warn("NATIVE_EDIT_PROFILE_PREVIEW_ENRICHMENT_FAILED", error);
      }
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return;
      setPublicProfile(loadedPublicProfile ?? await mapNativePublicProfile(publicProfileFallback));
    } catch (error) {
      loadFailedRef.current = true;
      setLoadFailed(true);
      hydratedRef.current = false;
      dirtyFieldsRef.current.clear();
      setMessage(nativeSafeErrorCopy(error, "Couldn't load your profile."));
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, sessionKey)) setLoading(false);
    }
  }, [ensureNativeEditProfileSession, mode, requireProfileSession, sessionKey, userId]);

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
    setErrors((current) => clearResolvedFormErrors(current, form, activePetCount, identitySaveRequested));
  }, [activePetCount, form, identitySaveRequested]);

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
        // The selected area is authoritative. Search globally so choosing an
        // area in another country can atomically correct the country field.
        const suggestions = await fetchNativePrioritizedLocationSuggestions(query, {
          selectedCountry: form.location_country,
          biasPoint: locationCoords ?? null,
        });
        if (!cancelled) {
          setLocationSuggestions(suggestions);
          setManualLocationAllowedQuery(null);
        }
      } catch {
        if (!cancelled) {
          setLocationSuggestions([]);
          setManualLocationAllowedQuery(null);
        }
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.location_country, form.location_district, locationCoords, locationSuggestionsOpen]);

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
    await AsyncStorage.setItem(draftKey(mode, userId, sessionKey), JSON.stringify(payload));
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
    const currentForm = formRef.current;
    const latestPhotos: NativeProfilePhotos = {
      ...currentForm.photos,
      ...photos,
    };
    if (!options.preserveLiveCaptions) return latestPhotos;
    return {
      ...latestPhotos,
      establishing_caption: currentForm.photos.establishing_caption,
      pack_caption: currentForm.photos.pack_caption,
      solo_caption: currentForm.photos.solo_caption,
      closer_caption: currentForm.photos.closer_caption,
    };
  };

  const persistProfilePhotos = async (
    photos: NativeProfilePhotos,
    options: { preserveLiveCaptions?: boolean } = {},
  ) => {
    const runPersist = async () => {
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
    const previousPhotos = formRef.current.photos;
    try {
      const nativeSession = requireProfileSession();
      const requestSessionKey = nativeSession.sessionKey;
      const nextForm = { ...formRef.current, photos: nextPhotos, social_album: nextSocialAlbum };
      cacheNativeAvatarPresentation(nativeSession.userId, nextPhotos.avatar_presentation);
      updateForm(nextForm);
      await persistLocalDraft(nextForm);
      if (mode === "onboarding") return;
      const accessToken = await ensureNativeEditProfileSession();
      const data = await updateNativeEditProfileWithToken(nativeSession.userId, accessToken, {
          photos: nextPhotos,
          avatar_url: getNativeProfilePhotoPublicUrl(nextPhotos.cover),
          social_album: nextSocialAlbum,
        });
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return;
      [
        nextPhotos.cover,
        nextPhotos.establishing,
        nextPhotos.pack,
        nextPhotos.solo,
        nextPhotos.closer,
        ...nextSocialAlbum,
      ].forEach((value) => invalidateNativeProfileImageResolverCache(value, { defaultBucket: "profile_photos" }));
      clearNativeProfilePhotoPublicUrlCache("profile_photos");

      const queuedDeletes = [...photoDeleteQueueRef.current];
      if (queuedDeletes.length > 0) {
        const deleteResults = await Promise.allSettled(queuedDeletes.map((path) => deleteNativeProfilePhotoPath(path, accessToken)));
        deleteResults.forEach((result, index) => {
          if (result.status === "rejected") {
            logNativeProtectedActionFailure("[native.editProfile] profile_photo_delete_failed", result.reason);
          }
        });
        photoDeleteQueueRef.current = [];
        setPhotoDeleteQueue([]);
      }

      if (data) {
        setProfileRow(data as unknown as ProfileRow);
        // Patch (don't clear) the summary cache with the new avatar so live
        // subscribers — e.g. the user's own posts in the social feed — update to
        // the fresh photo instead of re-emitting a stale pre-edit snapshot. We keep
        // the full profile fields intact (verification, name) by only patching when
        // a summary already exists.
        await patchNativeProfileSummaryCache(nativeSession.userId, {
          avatar_url: getNativeProfilePhotoPublicUrl(nextPhotos.cover),
          photos: nextPhotos,
          updated_at: cleanString(data?.updated_at) || new Date().toISOString(),
        }, { sessionKey: nativeSession.sessionKey });
        await invalidateNativePublicProfileCaches({ userId: nativeSession.userId });
        // The cached social feed rows embed the author avatar; purge so the next
        // feed load refetches the fresh photo instead of serving a stale snapshot.
        void purgeNativeSocialPersistentCache(nativeSession.userId);
        freshnessRegistry.invalidate(nativeSession.sessionKey, ["profile_summary", "public_profile", "media_carousel"]);
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
        previousPhotos.cover,
        previousPhotos.establishing,
        previousPhotos.pack,
        previousPhotos.solo,
        previousPhotos.closer,
      ].filter((value): value is string => isNativeProfilePhotoStoragePath(value));
      const orphanPaths = uploadedPaths.filter((path) => !previousPaths.includes(path));
      let cleanupResult: NativeProtectedActionCleanupResult = orphanPaths.length > 0 ? "queued" : "not_needed";
      if (orphanPaths.length > 0) {
        const cleanupResults = await Promise.allSettled(orphanPaths.map((path) => deleteNativeProfilePhotoPath(path, accessToken)));
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
      setMessage(nativeSafeErrorCopy(error, "Couldn't save profile photos."));
    }
    };
    const queuedPersist = profilePhotoPersistQueueRef.current.then(runPersist, runPersist);
    profilePhotoPersistQueueRef.current = queuedPersist.then(() => undefined, () => undefined);
    await queuedPersist;
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
    if (!(await confirmPhoneVerificationReset())) return;
    setSaving(true);
    try {
      const nativeSession = requireProfileSession();
      const requestSessionKey = nativeSession.sessionKey;
      const accessToken = await ensureNativeEditProfileSession();
      await persistLocalDraft();
      if (mode === "onboarding") {
        setMessage("Draft saved");
        return;
      }
      const payload = profilePayloadForSave(
        buildProfilePayload({ activePetCount, form, previousProfile: profileRow }),
        identitySaveRequested,
      );
      if (!SOCIAL_ID_REGEX.test(form.social_id)) delete payload.social_id;
      if (!form.phone.trim() || !isValidPhoneNumber(form.phone.trim())) delete payload.phone;
      const phoneChangedWithoutVerification =
        savedPhoneVerified &&
        normalizePhoneForCompare(form.phone) !== normalizePhoneForCompare(originalPhone) &&
        !phoneOtpVerified;
      let savedProfile = await saveNativeEditProfileWithToken(nativeSession.userId, accessToken, payload);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return;
      if (phoneChangedWithoutVerification) {
        await callNativeEditRpcWithToken(accessToken, "refresh_identity_verification_status", { p_user_id: nativeSession.userId });
        savedProfile = await fetchNativeEditProfileRowWithToken(nativeSession.userId, accessToken);
      }
      setProfileRow(savedProfile as unknown as ProfileRow);
      await clearNativeProfileSummaryCache(nativeSession.userId);
      await invalidateNativePublicProfileCaches({ userId: nativeSession.userId });
      clearNativeProfilePhotoPublicUrlCache("profile_photos");
      freshnessRegistry.invalidate(nativeSession.sessionKey, ["profile_summary", "public_profile"]);
      setMessage("Draft saved");
    } catch (error) {
      setMessage(nativeSafeErrorCopy(error, "Couldn't save your draft."));
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, sessionKey)) setSaving(false);
    }
  };

  const silentSaveDraftForPreview = async () => {
    if (!userId) return;
    if (loadFailedRef.current || !hydratedRef.current) {
      setMessage("Load your profile before previewing it.");
      return;
    }
    await persistLocalDraft();
    const payload = buildProfilePayload({ activePetCount, form, previousProfile: profileRow });
    if (mode === "edit") {
      const nativeSession = requireProfileSession();
      const accessToken = await ensureNativeEditProfileSession();
      const safePayload = profilePayloadForSave(payload, identitySaveRequested);
      if (!SOCIAL_ID_REGEX.test(form.social_id)) delete safePayload.social_id;
      if (!form.phone.trim() || !isValidPhoneNumber(form.phone.trim())) delete safePayload.phone;
      await saveNativeEditProfileWithToken(nativeSession.userId, accessToken, safePayload as Record<string, unknown>);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, nativeSession.sessionKey)) return;
    }
    setPublicProfile(await mapNativePublicProfile({
      ...(profileRow ?? {}),
      ...payload,
      id: userId,
      pet_heads: publicProfile?.petHeads ?? [],
    }));
  };

  const refreshImmediateProfilePreview = useCallback(() => {
    const payload = buildProfilePayload({ activePetCount, form, previousProfile: profileRow });
    const photos = normalizeNativeProfilePhotos(payload.photos as NativeProfilePhotos);
    const socialAlbum = canonicalizeNativeSocialAlbumEntries([
      photos.establishing,
      photos.pack,
      photos.solo,
      photos.closer,
    ].filter((item): item is string => Boolean(item)));
    const resolvedPhotoUrls = {
      cover: getNativeProfilePhotoPublicUrl(photos.cover),
      establishing: getNativeProfilePhotoPublicUrl(photos.establishing),
      pack: getNativeProfilePhotoPublicUrl(photos.pack),
      solo: getNativeProfilePhotoPublicUrl(photos.solo),
      closer: getNativeProfilePhotoPublicUrl(photos.closer),
    };
    setPublicProfile((current) => {
      if (!current) return current;
      return {
        ...current,
        affiliation: form.affiliation || "",
        bio: form.bio || "",
        degree: form.degree || "",
        displayName: form.display_name.trim() || current.displayName,
        ageYears: current.ageYears,
        gender: form.gender_genre || "",
        hasCar: form.has_car,
        height: form.height,
        languages: form.languages,
        locationName: payload.location_name ? String(payload.location_name) : current.locationName,
        major: form.major || "",
        nonSocial: false,
        occupation: form.occupation || "",
        orientation: form.orientation || "",
        petExperience: form.pet_experience,
        experienceYears: form.experience_years,
        petJourney: formatNativePetJourney({
          experienceYears: form.experience_years,
          petExperience: form.pet_experience,
        }),
        photoUrl: resolvedPhotoUrls.cover,
        photos,
        relationshipStatus: form.relationship_status || "",
        resolvedPhotoUrls,
        school: form.school || "",
        socialAlbum,
        socialId: form.social_id.trim() || current.socialId,
        updatedAt: new Date().toISOString(),
        visibility: {
          ...current.visibility,
          show_academic: Boolean(form.show_academic && (form.degree || form.school || form.major)),
          show_affiliation: Boolean(form.show_affiliation && form.affiliation),
          show_bio: Boolean(form.show_bio && form.bio),
          show_gender: Boolean(form.show_gender && form.gender_genre),
          show_height: Boolean(form.show_height && form.height),
          show_languages: Boolean(form.show_languages && form.languages.length > 0),
          show_location: Boolean(form.show_location && form.location_country && form.location_district),
          show_occupation: Boolean(form.show_occupation && form.occupation),
          show_orientation: Boolean(form.show_orientation && form.orientation),
          show_relationship_status: Boolean(form.show_relationship_status && form.relationship_status),
        },
      };
    });
  }, [activePetCount, form, profileRow]);

  const handleLocationPinResolved = (resolved: NativeResolvedLocation) => {
    setMessage(null);
    setLocationCoords({ lat: resolved.lat, lng: resolved.lng });
    acceptedLocationRef.current = resolved.district || form.location_district || null;
    setManualLocationAllowedQuery(null);
    setLocationSuggestions([]);
    setLocationSuggestionsOpen(false);
    updateForm((previous) => ({
      ...previous,
      location_country: resolved.countryName || resolved.country || previous.location_country,
      location_district: resolved.district || previous.location_district,
      location_name: buildNativeProfileAreaCity(
        resolved.district || previous.location_district,
        resolveNativeProfileMarketCity({ adminArea: resolved.adminArea, city: resolved.city, country: resolved.countryName || resolved.country, district: resolved.district }),
        resolved.countryName || resolved.country,
      ) || previous.location_name,
    }));
    setMessage("Location updated from your device.");
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
      setPhoneOtpTurnstileToken("");
      setPhoneOtpTurnstileResetKey((key) => key + 1);
      if (!result.ok) {
        setPhoneOtpUnavailable(Boolean(result.unavailable));
        setPhoneOtpMessage(nativeSafeErrorCopy(result.error, "Phone verification is temporarily unavailable. Please try again later."));
        return;
      }
      setPhoneOtpRequested(true);
      setPhoneOtpVerified(false);
      setPhoneOtpUnavailable(false);
      setPhoneOtpCooldown(result.cooldownSeconds || 90);
      setPhoneSentMaskedHint(maskNativePhoneForOtpNotice(phone));
      setPhoneOtpMessage(`Verification code sent to ${maskNativePhoneForOtpNotice(phone)}.`);
    } catch (error) {
      setPhoneOtpTurnstileToken("");
      setPhoneOtpTurnstileResetKey((key) => key + 1);
      setPhoneOtpMessage(nativeSafeErrorCopy(error, "Phone verification is temporarily unavailable."));
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
        setPhoneOtpMessage(nativeSafeErrorCopy(result.error, "We couldn't verify the code right now. Please try again."));
        return;
      }
      setPhoneOtpVerified(true);
      setPhoneOtpRequested(false);
      setPhoneOtpCode("");
      setPhoneSentMaskedHint(null);
      setPhoneOtpMessage("Phone verified.");
      // The OTP endpoint has already written the canonical phone-verification
      // fields. Read that single authoritative status now so Verify Identity
      // and Account do not wait for a later profile save or remount.
      try {
        const nativeSession = requireProfileSession();
        const verificationStatus = await fetchNativeVerifyIdentityProfileStatus({
          force: true,
          sessionKey: nativeSession.sessionKey,
          userId: nativeSession.userId,
        });
        if (!isCurrentNativeSessionKey(sessionKeyRef.current, nativeSession.sessionKey)) return;
        const verifiedPhone = cleanString(verificationStatus.phone) || phone;
        setProfileRow((current) => current ? {
          ...current,
          phone: verifiedPhone,
          phone_verification_status: verificationStatus.phoneVerificationStatus,
          phone_verified_at: verificationStatus.phoneVerifiedAt,
        } : current);
        await patchNativeProfileSummaryCache(nativeSession.userId, {
          phone: verifiedPhone,
          phone_verification_status: verificationStatus.phoneVerificationStatus,
          phone_verified_at: verificationStatus.phoneVerifiedAt,
        }, { sessionKey: nativeSession.sessionKey });
      } catch {
        // A confirmed OTP remains confirmed locally. The normal foreground
        // profile refresh will retry cache convergence if this read is offline.
      }
    } catch (error) {
      setPhoneOtpMessage(nativeSafeErrorCopy(error, "We couldn't verify the code right now. Please try again."));
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

  async function confirmPhoneVerificationReset() {
    if (!shouldConfirmPhoneVerificationReset) return true;
    return new Promise<boolean>((resolve) => {
      phoneVerificationResetResolverRef.current?.(false);
      phoneVerificationResetResolverRef.current = resolve;
      setPhoneVerificationResetPromptOpen(true);
    });
  }

  function resolvePhoneVerificationResetPrompt(confirmed: boolean) {
    setPhoneVerificationResetPromptOpen(false);
    const resolve = phoneVerificationResetResolverRef.current;
    phoneVerificationResetResolverRef.current = null;
    resolve?.(confirmed);
  }

  const handlePhoneInlineSave = async () => {
    return confirmPhoneVerificationReset();
  };

  const displayNameCooldown = buildIdentityCooldown(profileRow?.display_name_changed_at, DISPLAY_NAME_COOLDOWN_DAYS, "Display name");
  const socialIdCooldown = buildIdentityCooldown(profileRow?.social_id_changed_at, SOCIAL_ID_COOLDOWN_DAYS, "Social ID");

  const saveProfile = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!userId) {
      if (!silent) setSaveToastMessage("Please sign in again to save your profile.");
      return false;
    }
    if (loadFailedRef.current || !hydratedRef.current) {
      if (!silent) setSaveToastMessage("Load your profile before saving.");
      return false;
    }
    const nextErrors = validateForm(form, activePetCount, identitySaveRequested);
    const locationQuery = form.location_district.trim();
    if (!nextErrors.location && locationQuery && acceptedLocationRef.current !== locationQuery && manualLocationAllowedQuery !== locationQuery) {
      nextErrors.location = "Choose a search result, or use this exact text only when no result exists.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (!silent) {
        triggerSaveShake();
        setErrorFocusRequest((current) => current + 1);
      }
      return false;
    }
    const displayNameChanged = form.display_name.trim() !== cleanString(profileRow?.display_name);
    const socialIdChanged = identitySaveRequested && form.social_id.trim().toLowerCase() !== cleanString(profileRow?.social_id).toLowerCase();
    if (displayNameChanged && displayNameCooldown.locked) {
      setErrors((current) => ({ ...current, display_name: displayNameCooldown.lockedMessage }));
      if (!silent) {
        triggerSaveShake();
        setSaveToastMessage(displayNameCooldown.lockedMessage);
        setErrorFocusRequest((current) => current + 1);
      }
      return false;
    }
    if (socialIdChanged && socialIdCooldown.locked) {
      setErrors((current) => ({ ...current, social_id: socialIdCooldown.lockedMessage }));
      if (!silent) {
        triggerSaveShake();
        setSaveToastMessage(socialIdCooldown.lockedMessage);
        setErrorFocusRequest((current) => current + 1);
      }
      return false;
    }
    setSaving(true);
    try {
      const nativeSession = requireProfileSession();
      const requestSessionKey = nativeSession.sessionKey;
      const accessToken = await ensureNativeEditProfileSession();
      const socialTaken = await checkSocialIdTaken(form.social_id);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return false;
      if (socialTaken && form.social_id.toLowerCase() !== cleanString(profileRow?.social_id).toLowerCase()) {
        setErrors((current) => ({ ...current, social_id: "Please use an available Social ID before saving" }));
        return false;
      }
      if (identitySaveRequested && form.phone.trim() !== cleanString(profileRow?.phone) && !phoneOtpVerified) {
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
      const identityLocked = Boolean(cleanString(profileRow?.dob));
      const profileForm = identityLocked
        ? {
          ...form,
          dob: cleanString(profileRow?.dob) || form.dob,
          legal_name: cleanString(profileRow?.legal_name) || form.legal_name,
        }
        : form;
      const payload = profilePayloadForSave(
        buildProfilePayload({ activePetCount, form: profileForm, previousProfile: profileRow }),
        identitySaveRequested,
      );
      const data = await saveNativeEditProfileWithToken(nativeSession.userId, accessToken, payload);
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return false;
      let savedProfile = data as unknown as ProfileRow;
      if (shouldRevokePhoneVerification) {
        await callNativeEditRpcWithToken(accessToken, "refresh_identity_verification_status", { p_user_id: nativeSession.userId });
        savedProfile = await fetchNativeEditProfileRowWithToken(nativeSession.userId, accessToken);
      }
      if (phoneOtpVerified) {
        try {
          await callNativeEditRpcWithToken(accessToken, "refresh_my_phone_verification_status", {});
        } catch {
          // Phone OTP verification already succeeded; refresh is a best-effort parity sync.
        }
      }
      if (mode === "onboarding") {
        await Promise.allSettled([
          callNativeEditRpcWithToken(accessToken, "refresh_identity_verification_status", { p_user_id: nativeSession.userId }),
          callNativeEditRpcWithToken(accessToken, "refresh_my_phone_verification_status", {}),
        ]);
        savedProfile = await fetchNativeEditProfileRowWithToken(nativeSession.userId, accessToken);
      }
      if (!isCurrentNativeSessionKey(sessionKeyRef.current, requestSessionKey)) return false;
      await AsyncStorage.removeItem(draftKey(mode, nativeSession.userId, nativeSession.sessionKey));
      await clearNativeProfileSummaryCache(nativeSession.userId);
      await invalidateNativePublicProfileCaches({ userId: nativeSession.userId });
      clearNativeProfilePhotoPublicUrlCache("profile_photos");
      await writeNativeProfileSummaryCache(nativeSession.userId, { profile: savedProfile, quota: null }, { sessionKey: nativeSession.sessionKey });
      await Promise.allSettled(photoDeleteQueueRef.current.map((path) => deleteNativeProfilePhotoPath(path, accessToken)));
      photoDeleteQueueRef.current = [];
      setPhotoDeleteQueue([]);
      setProfileRow(savedProfile);
      dirtyFieldsRef.current.clear();
      baseUpdatedAtRef.current = cleanString(savedProfile.updated_at) || baseUpdatedAtRef.current;
      freshnessRegistry.invalidate(nativeSession.sessionKey, ["profile_summary", "public_profile", "media_carousel"]);
      setPublicProfile(await mapNativePublicProfile({ ...savedProfile, pet_heads: publicProfile?.petHeads ?? [] }));
      const locationChanged = cleanString(profileRow?.location_country) !== cleanString(savedProfile.location_country)
        || cleanString(profileRow?.location_city) !== cleanString(savedProfile.location_city);
      if (locationChanged) await onCareLocationSaved?.();
      if (!silent) {
        haptic.success();
        setSaveToastMessage(mode === "onboarding" ? "Profile completed successfully." : "Profile updated");
      }
      if (mode === "onboarding") {
        const shouldSetPet = activePetCount > 0 || form.owns_pets === true;
        if (shouldSetPet) {
          setPetProfilePromptOpen(true);
        } else {
          onNavigate("/", { preserveHistory: false, refreshOnboarding: true });
        }
      }
      return true;
    } catch (error) {
      haptic.error();
      if (!silent) setSaveToastMessage(nativeSafeErrorCopy(error, "Couldn't update your profile."));
      return false;
    } finally {
      if (isCurrentNativeSessionKey(sessionKeyRef.current, sessionKey)) setSaving(false);
    }
  };

  useEffect(() => {
    const setHeight = (h: number) => { keyboardHeightRef.current = h; };
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => setHeight(e.endCoordinates?.height ?? 0));
    const frameSub = Keyboard.addListener("keyboardDidChangeFrame", (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { showSub.remove(); frameSub.remove(); hideSub.remove(); };
  }, []);

  const scrollNativeProfileFieldIntoView = useCallback((target?: number | null) => {
    if (!target) return;

    UIManager.measureInWindow(target, (_x, y, _width, height) => {
      const windowHeight = Dimensions.get("window").height;
      // Center the field within the area above the keyboard so it never lands under it.
      const visibleHeight = windowHeight - keyboardHeightRef.current;
      const desiredY = Math.max(huddleLayout.headerHeight + huddleSpacing.x5, (visibleHeight - height) / 2);
      const nextY = Math.max(0, editScrollYRef.current + y - desiredY);

      editScrollRef.current?.scrollTo({ y: nextY, animated: true });
    });
  }, []);

  const previewProfile = useMemo(() => publicProfile, [publicProfile]);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const profileShareData = useMemo(() => {
    if (!previewProfile) return null;
    return buildProfileShareCard({
      id: previewProfile.userId || userId || "",
      displayName: previewProfile.displayName,
      socialId: previewProfile.socialId,
      avatarUrl: previewProfile.photoUrl,
      tier: previewProfile.membershipTier,
      isVerified: previewProfile.isVerified,
      createdAt: previewProfile.createdAt,
      memberNumber: previewProfile.memberNumber ?? memberNumber,
      engagementTier: previewProfile.engagement?.tier,
      experienceYears: previewProfile.experienceYears,
      petExperience: previewProfile.petExperience,
      roleLabels: previewProfile.availabilityStatus,
      groupCount: previewProfile.engagementStats?.groups,
      friendCount: previewProfile.engagementStats?.friends,
      pets: previewProfile.petHeads.map((pet) => ({
        name: pet.name || "Pet",
        species: pet.species,
        photoUri: pet.photoUrl,
        photoPosition: pet.photoPosition,
      })),
    });
  }, [memberNumber, previewProfile, userId]);
  const onboardingEditMode = mode === "onboarding" && viewMode === "edit";

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <NativeLoadingState variant="centered" />
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
      <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={onGoBack} style={styles.backButton}>
            <Feather color={huddleColors.iconMuted} name="chevron-left" size={26} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tell us about you</Text>
            <Text style={styles.subtitle}>Customize how you appear to the community</Text>
          </View>
          {viewMode === "edit" ? (
            <Animated.View style={saveShakeStyle}>
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
              {saving ? <NativeSpinner tone="secondary" /> : <Feather color={huddleColors.text} name="save" size={20} />}
            </Pressable>
            </Animated.View>
          ) : <View style={styles.headerSaveSlot} />}
        </View>
        <View style={styles.tabWrap}>
          <Pressable onPress={() => setViewMode("edit")} style={[styles.tabButton, viewMode === "edit" ? styles.tabButtonActive : null]}>
            <Text style={[styles.tabText, viewMode === "edit" ? styles.tabTextActive : null]}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              refreshImmediateProfilePreview();
              setViewMode("view");
              setTimeout(() => previewScrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
              void silentSaveDraftForPreview();
            }}
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
              openEditorRequest={editorRequest}
              onExitToSettings={mode === "edit" ? onGoBack : undefined}
              errorFocusRequest={errorFocusRequest}
              errors={errors}
              form={form}
              accessToken={liveAccessToken}
              displayNameCooldown={displayNameCooldown}
              mode={mode}
              onChange={updateForm}
              onError={setSaveToastMessage}
              identityLocked={Boolean(cleanString(profileRow?.dob))}
              identityDocumentCountry={identityProfileStatus?.identityDocumentCountry}
              identityDocumentGender={identityProfileStatus?.identityDocumentGender}
              identityDocumentStatus={identityProfileStatus?.identityDocumentStatus}
              identityLegalName={identityProfileStatus?.legalName}
              onIdentityEditorOpen={refreshIdentityProfileStatus}
              profileVerified={isNativeVerifiedProfile(profileRow)}
              onPreviousPhotoPathQueued={(path) => {
                if (isNativeProfilePhotoStoragePath(path)) {
                  photoDeleteQueueRef.current = photoDeleteQueueRef.current.includes(path) ? photoDeleteQueueRef.current : [...photoDeleteQueueRef.current, path];
                  setPhotoDeleteQueue(photoDeleteQueueRef.current);
                }
              }}
              onProfilePhotoCaptionAutosave={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos)}
              onProfilePhotoCaptionCommit={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos)}
              onProfilePhotosCommit={(photos: NativeProfilePhotos) => void persistProfilePhotos(photos, { preserveLiveCaptions: true })}
              photosVersion={cleanString(profileRow?.updated_at) || null}
              onPhoneInlineSave={handlePhoneInlineSave}
              onPhoneOtpCodeChange={setPhoneOtpCode}
              onPhoneOtpRequest={() => void handleRequestPhoneOtp()}
              onPhoneOtpVerify={() => void handleVerifyPhoneOtp()}
              locationLoading={locationLoading}
              locationSuggestions={locationSuggestions}
              locationSuggestionsOpen={locationSuggestionsOpen}
	              onLocationFocusChange={setLocationSuggestionsOpen}
	              onLocationTextChange={() => {
	                acceptedLocationRef.current = null;
	                setManualLocationAllowedQuery(null);
	              }}
	              onLocationSuggestionSelect={(item) => {
	                const selectedDistrict = item.district || form.location_district;
	                const selectedCity = String(item.city || "").trim();
	                const selectedCountry = item.country || form.location_country;
	                acceptedLocationRef.current = selectedDistrict;
	                setManualLocationAllowedQuery(null);
	                setLocationCoords({ lat: item.lat, lng: item.lng });
                setLocationSuggestions([]);
                setLocationSuggestionsOpen(false);
                updateForm((previous) => ({
                  ...previous,
	                  location_country: item.country || previous.location_country,
	                  location_district: selectedDistrict,
	                  // Profile display = exactly what the search parser gives us:
	                  // District / Area, City, Country (deduped) — no new geocoding.
	                  location_name: [selectedDistrict, selectedCity, selectedCountry]
	                    .map((part) => String(part || "").trim())
	                    .filter((part, index, values) => part && values.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index)
	                    .join(", ") || selectedDistrict,
                }));
              }}
              onLocationPinResolved={handleLocationPinResolved}
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
                    key={`edit-profile-phone-turnstile-${phoneOtpTurnstileResetKey}`}
                    onError={setPhoneOtpTurnstileError}
                    onToken={(token) => {
                      setPhoneOtpTurnstileToken(token);
                      if (token) setPhoneOtpTurnstileError("");
                    }}
                    siteKey={getNativeTurnstileSiteKey()}
                  />
                ) : null
              }
              phoneOtpUnavailable={phoneOtpUnavailable}
              phoneOtpVerified={phoneOtpVerified}
              phoneRequiresVerification={phoneRequiresVerification}
              savedPhoneVerified={savedPhoneVerified}
              socialIdCooldown={socialIdCooldown}
              socialIdStatus={socialIdStatus}
              onDropdownOpen={(_, target) => {
                setTimeout(() => scrollNativeProfileFieldIntoView(target), 80);
              }}
              userId={userId}
            />
          </ScrollView>
        ) : previewProfile ? (
          <View style={styles.contentScroller}>
            <ScrollView ref={previewScrollRef} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
              <NativePublicProfileContent memberNumber={memberNumber} profile={previewProfile} />
            </ScrollView>
            {profileShareData ? (
              <Pressable
                accessibilityLabel="Share your huddle card"
                accessibilityRole="button"
                onPress={() => setShareCardOpen(true)}
                style={styles.shareCardButton}
              >
                <NativeGlassSurface style={styles.shareCardGlass}>
                  <Feather color={huddleColors.text} name="share" size={18} />
                </NativeGlassSurface>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.message}>Save your profile before previewing it.</Text>
          </View>
        )}
        {onboardingEditMode ? (
          <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + huddleSpacing.x3 }]}>
            <Animated.View style={saveShakeStyle}>
              <Pressable disabled={saving} onPress={() => void saveProfile()} style={[styles.primaryButton, saving ? styles.disabled : null]}>
                {saving ? <NativeSpinner tone="primary" /> : <Text style={styles.primaryButtonText}>Complete profile</Text>}
              </Pressable>
            </Animated.View>
            <Pressable disabled={saving} onPress={saveDraft} style={[styles.secondaryButton, saving ? styles.disabled : null]}>
              <Text style={styles.secondaryButtonText}>Save draft</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {profileShareData ? (
        <NativeShareCardModal data={profileShareData} visible={shareCardOpen} onClose={() => setShareCardOpen(false)} />
      ) : null}
      <AppConfirmModal
        body="Changing your phone number without completing phone verification will remove your verified badge. Your existing Care profile and Care listing will remain available."
        cancel="Keep editing"
        confirm="Save anyway"
        destructive
        visible={phoneVerificationResetPromptOpen}
        onCancel={() => resolvePhoneVerificationResetPrompt(false)}
        onConfirm={() => resolvePhoneVerificationResetPrompt(true)}
        title="Save without phone verification?"
      />
      <AppConfirmModal
        body="You can add pet profiles now, or skip this and set them up later from Home."
        cancel="Skip for now"
        confirm="Add pet profile"
        visible={mode === "onboarding" && petProfilePromptOpen}
        onCancel={() => {
          setPetProfilePromptOpen(false);
          onNavigate("/", { preserveHistory: false, refreshOnboarding: true });
        }}
        onConfirm={() => {
          setPetProfilePromptOpen(false);
          onNavigate("/edit-pet-profile", { refreshOnboarding: true });
        }}
        title="Add your pet profiles now?"
      />
      {saveToastMessage ? <NativeToast message={saveToastMessage} onDismiss={() => setSaveToastMessage(null)} /> : null}
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
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  // Stationed at the top-right corner of the profile card in view mode; the
  // frosted recipe matches the bottom nav (NativeGlassSurface chrome), not a
  // solid white circle.
  shareCardButton: {
    position: "absolute",
    top: huddleSpacing.x5,
    right: huddleSpacing.x5,
    ...huddleShadows.glassElevation1,
  },
  shareCardGlass: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
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
