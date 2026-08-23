import type { NativePetDetailsData } from "../components/NativePetDetailsContent";
import {
  normalizeNativeProfilePhotos,
  resolveNativeProfilePhotos,
  type NativeProfilePhotos,
} from "./nativeProfilePhotos";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import { fetchNativeEngagementTiers, type NativeEngagementSummary } from "./nativeEngagement";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { getFreshNativeAccessToken } from "./nativeFunctionClient";
import { formatNativePetJourney } from "./nativePetEmoji";
import { readNativeDisplayCacheItem, readNativeDisplayCacheKeys } from "./nativeDisplayCacheStorage";

export type NativePublicProfilePetHead = {
  ageYears?: number | null;
  id: string;
  isPublic?: boolean | null;
  name?: string | null;
  photoUrl?: string | null;
  photoPosition?: { centerX: number; centerY: number; widthPct: number; sourceAspect?: number } | null;
  species?: string | null;
  updatedAt?: string | null;
};

export type NativePublicProfileVisibility = {
  show_academic: boolean;
  show_affiliation: boolean;
  show_age: boolean;
  show_bio: boolean;
  show_gender: boolean;
  show_height: boolean;
  show_languages?: boolean;
  show_location?: boolean;
  show_occupation: boolean;
  show_orientation: boolean;
  show_relationship_status: boolean;
};

export type NativeResolvedProfilePhotoUrls = {
  cover: string | null;
  establishing: string | null;
  pack: string | null;
  solo: string | null;
  closer: string | null;
};

export type NativeProfileEngagementStats = {
  groups: number;
  friends: number;
  likes: number;
};

export type NativePublicProfile = {
  affiliation: string;
  availabilityStatus: string[];
  bio: string;
  createdAt: string | null;
  degree: string;
  displayName: string;
  ageYears: number | null;
  experienceYears: string;
  gender: string;
  hasCar: boolean;
  height: string;
  isVerified: boolean;
  lastActiveAt: string | null;
  languages: string[];
  locationCity: string;
  locationCountry: string;
  locationDistrict: string;
  locationDisplay: string;
  locationName: string;
  major: string;
  memberSince: string | null;
  memberNumber: number | null;
  membershipTier: string | null;
  nonSocial: boolean;
  discoveryOptOut: boolean;
  occupation: string;
  orientation: string;
  petJourney: string;
  petExperience: string[];
  petHeads: NativePublicProfilePetHead[];
  photoUrl: string | null;
  photos: NativeProfilePhotos;
  resolvedPhotoUrls: NativeResolvedProfilePhotoUrls;
  relationshipStatus: string;
  school: string;
  socialAlbum: string[];
  socialId: string | null;
  updatedAt: string | null;
  userId: string;
  engagement: NativeEngagementSummary | null;
  engagementStats: NativeProfileEngagementStats | null;
  visibility: NativePublicProfileVisibility;
};

type ProfileRow = Record<string, unknown>;

export type NativeVisibleProfileTarget = {
  fallbackData: ProfileRow;
  profileUserId: string;
};

type NativePublicProfileSnapshotPayload = ProfileRow | {
  member_number?: unknown;
  profile?: ProfileRow | null;
};

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const ageYearsFromDate = (value: unknown): number | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) years -= 1;
  return years >= 0 ? years : null;
};

const nullableAgeYears = (value: unknown, legacyDob?: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 100) return parsed;
  return ageYearsFromDate(legacyDob);
};

export const createNativeVisibleProfileTarget = (
  profileUserId: string | null | undefined,
  fallbackData?: ProfileRow | null,
  fallbackName?: string | null,
): NativeVisibleProfileTarget | null => {
  const cleanProfileUserId = cleanString(profileUserId);
  if (!cleanProfileUserId) return null;

  return {
    profileUserId: cleanProfileUserId,
    fallbackData: mergeProfileRows({ id: cleanProfileUserId, display_name: fallbackName || "User" }, fallbackData),
  };
};

type NativePublicProfileFetchFailure = {
  code: "missing_access_token" | "network_error" | "profile_not_found" | "profile_read_error" | "pet_read_error";
  message: string;
};

class NativePublicProfileFetchError extends Error {
  code: NativePublicProfileFetchFailure["code"];

  constructor(failure: NativePublicProfileFetchFailure) {
    super(failure.message);
    this.code = failure.code;
  }
}

const publicProfileFetchLog = (event: string, fields: Record<string, unknown>) => {
  if (typeof __DEV__ === "boolean" && !__DEV__) return;
  console.log("NATIVE_PUBLIC_PROFILE_FETCH", { event, ...fields });
};

const nativePublicProfileRpc = async <T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, accessToken);
  if (error) throw error;
  return data as T;
};

const fetchNativePublicProfileRow = async (
  userId: string,
  accessToken?: string | null,
): Promise<ProfileRow | null> => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) {
    throw new NativePublicProfileFetchError({ code: "missing_access_token", message: "missing_access_token" });
  }
  try {
    const payload = await nativePublicProfileRpc<NativePublicProfileSnapshotPayload | null>("get_native_public_profile_snapshot", {
      p_user_id: userId,
    }, token);
    const wrappedPayload = payload && typeof payload === "object" && "profile" in payload
      ? payload as { member_number?: unknown; profile?: ProfileRow | null }
      : null;
    const profile = wrappedPayload?.profile ?? (payload as ProfileRow | null);
    if (!profile?.id) {
      throw new NativePublicProfileFetchError({ code: "profile_not_found", message: "profile_not_found" });
    }
    const canonicalProfile = {
      ...profile,
      bio: typeof profile.bio === "string" ? profile.bio : "",
      show_bio: profile.show_bio !== false,
    };
    return wrappedPayload ? { ...canonicalProfile, member_number: wrappedPayload.member_number } : canonicalProfile;
  } catch (error) {
    if (error instanceof NativePublicProfileFetchError) throw error;
    throw new NativePublicProfileFetchError({
      code: "network_error",
      message: error instanceof Error ? error.message : "network_error",
    });
  }
};

const fetchNativePublicPetRow = async ({
  accessToken,
  ownerId,
  petId,
}: {
  accessToken?: string | null;
  ownerId?: string | null;
  petId?: string | null;
}): Promise<ProfileRow | null> => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) {
    throw new NativePublicProfileFetchError({ code: "missing_access_token", message: "missing_access_token" });
  }
  const cleanPetId = cleanString(petId);
  const cleanOwnerId = cleanString(ownerId);
  if (!cleanPetId && !cleanOwnerId) return null;
  const pet = await nativePublicProfileRpc<ProfileRow | null>("get_native_public_profile_pet", {
    p_owner_id: cleanOwnerId || null,
    p_pet_id: cleanPetId || null,
  }, token);
  return pet?.id ? pet : null;
};

const nullableString = (value: unknown) => {
  const clean = cleanString(value);
  return clean || null;
};

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === "string")
);

const isDataOrBlob = (value: string) => value.startsWith("data:") || value.startsWith("blob:");

const sanitizePathLike = (value: string) => (
  decodeURIComponent(String(value || "").split("#")[0].split("?")[0]).replace(/^\/+/, "")
);

const extractNativeSocialAlbumKeyFromUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname || "");
    const profilePublicMatch = pathname.match(/\/storage\/v1\/object\/public\/(profile_photos)\/(.+)$/);
    if (profilePublicMatch?.[1] && profilePublicMatch?.[2]) {
      const path = sanitizePathLike(profilePublicMatch[2]);
      return path.startsWith(`${profilePublicMatch[1]}/`) ? path : `${profilePublicMatch[1]}/${path}`;
    }
    const profileSignMatch = pathname.match(/\/storage\/v1\/object\/sign\/(profile_photos)\/(.+)$/);
    if (profileSignMatch?.[1] && profileSignMatch?.[2]) {
      const path = sanitizePathLike(profileSignMatch[2]);
      return path.startsWith(`${profileSignMatch[1]}/`) ? path : `${profileSignMatch[1]}/${path}`;
    }
    return null;
  } catch {
    return null;
  }
};

const toNativeSocialAlbumKey = (value: string): string | null => {
  const raw = String(value || "").trim();
  if (!raw || isDataOrBlob(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    const extracted = extractNativeSocialAlbumKeyFromUrl(raw);
    return extracted ? sanitizePathLike(extracted) : null;
  }
  if (!raw.includes("/")) return null;
  const path = sanitizePathLike(raw);
  return /^profile_photos\//i.test(path) ? path : null;
};

const mapNativePetDetailsRow = (row: ProfileRow): NativePetDetailsData => ({
  id: String(row.id || ""),
  owner_id: typeof row.owner_id === "string" ? row.owner_id : null,
  name: typeof row.name === "string" ? row.name : "",
  species: typeof row.species === "string" ? row.species : "",
  breed: typeof row.breed === "string" ? row.breed : null,
  gender: typeof row.gender === "string" ? row.gender : null,
  neutered_spayed: row.neutered_spayed === true,
  dob: typeof row.dob === "string" ? row.dob : null,
  age_years: nullableAgeYears(row.age_years, row.dob),
  weight: typeof row.weight === "number" || typeof row.weight === "string" ? row.weight : null,
  weight_unit: typeof row.weight_unit === "string" ? row.weight_unit : "kg",
  bio: typeof row.bio === "string" ? row.bio : null,
  routine: typeof row.routine === "string" ? row.routine : null,
  vet_contact: typeof row.vet_contact === "string" ? row.vet_contact : null,
  microchip_id: typeof row.microchip_id === "string" ? row.microchip_id : null,
  temperament: isStringArray(row.temperament) ? row.temperament : null,
  vet_visit_records: Array.isArray(row.vet_visit_records) ? row.vet_visit_records as NativePetDetailsData["vet_visit_records"] : null,
  set_reminder: row.set_reminder && typeof row.set_reminder === "object" ? row.set_reminder as NativePetDetailsData["set_reminder"] : null,
	  medications: Array.isArray(row.medications) ? row.medications as NativePetDetailsData["medications"] : null,
	  photo_url: typeof row.photo_url === "string" ? row.photo_url : null,
	  is_active: row.is_active !== false,
	  updated_at: nullableString(row.updated_at),
	});

const mergeProfileRows = (
  baseData: ProfileRow | null | undefined,
  resolvedRow: ProfileRow | null | undefined,
) => ({
  ...(baseData ?? {}),
  ...(resolvedRow ?? {}),
});

export const canonicalizeNativeSocialAlbumEntries = (entries: string[]) => (
  Array.from(entries.reduce((unique, entry) => {
    const raw = String(entry || "").trim();
    if (!raw) return unique;
    if (isDataOrBlob(raw)) {
      unique.add(raw);
      return unique;
    }
    if (/^https?:\/\//i.test(raw)) {
      unique.add(toNativeSocialAlbumKey(raw) || raw);
      return unique;
    }
    const key = toNativeSocialAlbumKey(raw);
    if (key) unique.add(key);
    return unique;
  }, new Set<string>()))
);

export const normalizeNativeAvailabilityStatus = (row: ProfileRow): string[] => {
  const normalizeAvailabilityRole = (value: unknown) => {
    const role = String(value || "").trim();
    if (!role || role.toLowerCase() === "free") return "";
    if (/^vet$/i.test(role)) return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(role)) return "Animal Friend";
    const allowed = new Set(["Pet Parent", "Pet Nanny", "Animal Friend", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"]);
    return allowed.has(role) ? role : "";
  };
  if (Array.isArray(row.availability_status) && row.availability_status.length > 0) {
    const roles = row.availability_status
      .map(normalizeAvailabilityRole)
      .filter(Boolean);
    if (roles.length > 0) return roles;
  }
  if (row.has_pets === true || row.owns_pets === true || normalizeNativePetHeads(row.pet_heads).length > 0) return ["Pet Parent"];
  return ["Animal Friend"];
};

export const normalizeNativePetHeads = (value: unknown): NativePublicProfilePetHead[] => {
  if (!Array.isArray(value)) return [];
  const heads: NativePublicProfilePetHead[] = [];
  value.forEach((pet) => {
      if (!pet || typeof pet !== "object") return null;
      const record = pet as Record<string, unknown>;
      const id = cleanString(record.id);
      if (!id) return null;
      heads.push({
        id,
        name: nullableString(record.name),
        species: nullableString(record.species),
        ageYears: nullableAgeYears(record.age_years, record.dob),
        photoUrl: nullableString(record.photoUrl)
          ?? nullableString(record.photo_url),
        photoPosition: (() => {
          const presentation = record.photoPresentation ?? record.photo_presentation;
          if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
          const home = (presentation as { home?: unknown }).home;
          if (!home || typeof home !== "object" || Array.isArray(home)) return null;
          const { centerX, centerY, widthPct, sourceAspect } = home as { centerX?: unknown; centerY?: unknown; widthPct?: unknown; sourceAspect?: unknown };
          return typeof centerX === "number" && typeof centerY === "number" ? { centerX, centerY, widthPct: typeof widthPct === "number" ? widthPct : 100, ...(typeof sourceAspect === "number" ? { sourceAspect } : {}) } : null;
        })(),
	        isPublic: typeof record.isPublic === "boolean" ? record.isPublic : record.is_public !== false,
	        updatedAt: nullableString(record.updatedAt) ?? nullableString(record.updated_at),
	      });
      return null;
    });
  return heads;
};

export const fetchNativeProfileEngagementStats = async (
  userId: string,
  accessToken?: string | null,
): Promise<NativeProfileEngagementStats | null> => {
  if (!userId) return null;
  try {
    const data = await nativePublicProfileRpc<
      Array<{ groups_count?: number | null; friends_count?: number | null; likes_count?: number | null }>
      | { groups_count?: number | null; friends_count?: number | null; likes_count?: number | null }
      | null
    >("get_native_profile_engagement_stats", { p_user_id: userId }, accessToken);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      groups: Number(row?.groups_count ?? 0),
      friends: Number(row?.friends_count ?? 0),
      likes: Number(row?.likes_count ?? 0),
    };
  } catch (error) {
    publicProfileFetchLog("engagement_stats_failed", {
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : null,
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
};

export const mapNativePublicProfile = async (
  row: ProfileRow,
  fallbackName?: string | null,
  accessToken?: string | null,
): Promise<NativePublicProfile> => {
  const userId = cleanString(row.id);
  const prefs = row.prefs && typeof row.prefs === "object" ? row.prefs as Record<string, unknown> : {};
  const socialAlbum = canonicalizeNativeSocialAlbumEntries(isStringArray(row.social_album) ? row.social_album : []);
  const photos = normalizeNativeProfilePhotos(row.photos, {
    avatarUrl: nullableString(row.avatar_url),
    socialAlbum,
  });
  const resolvedPhotoUrls = await resolveNativeProfilePhotos(photos);
  const experienceYearsValue = row.pet_experience_years ?? row.experience_years ?? "";
  const petExperience = isStringArray(row.pet_experience) ? row.pet_experience : [];
  const petHeads = normalizeNativePetHeads(row.pet_heads);
  const petJourney = formatNativePetJourney({
    experienceYears: experienceYearsValue,
    petExperience,
  });
  const [engagement, engagementStats] = await Promise.all([
    fetchNativeEngagementTiers([userId], accessToken).then((tiers) => tiers.get(userId) ?? null),
    fetchNativeProfileEngagementStats(userId, accessToken),
  ]);

  return {
    affiliation: cleanString(row.affiliation),
    availabilityStatus: normalizeNativeAvailabilityStatus(row),
    bio: cleanString(row.bio),
    createdAt: nullableString(row.created_at),
    degree: cleanString(row.degree),
    displayName: cleanString(row.display_name) || cleanString(fallbackName) || "User",
    ageYears: nullableAgeYears(row.age_years, row.dob),
    experienceYears: cleanString(experienceYearsValue),
    gender: cleanString(row.gender_genre),
    hasCar: row.has_car === true,
    height: row.height == null ? "" : String(row.height),
    isVerified: isNativeVerifiedProfile(row),
    lastActiveAt: nullableString(row.last_active_at) ?? nullableString(row.updated_at),
    languages: isStringArray(row.languages) ? row.languages : [],
    locationCity: cleanString(row.location_city),
    locationCountry: cleanString(row.location_country),
    locationDistrict: cleanString(row.location_district),
    locationDisplay: cleanString(row.location_display),
    locationName: cleanString(row.location_name),
    major: cleanString(row.major),
    memberSince: nullableString(row.created_at) ?? nullableString(row.member_since),
    memberNumber: nullablePositiveInteger(row.member_number),
    membershipTier: nullableString(row.effective_tier) ?? nullableString(row.tier),
    nonSocial: row.non_social === true,
    discoveryOptOut: row.discovery_opt_out === true,
    occupation: cleanString(row.occupation),
    orientation: cleanString(row.orientation),
    petJourney,
    petExperience,
    petHeads,
    photoUrl: nullableString(row.avatar_url),
    photos,
    resolvedPhotoUrls,
    relationshipStatus: cleanString(row.relationship_status),
    school: cleanString(row.school),
    socialAlbum,
    socialId: nullableString(row.social_id),
    updatedAt: nullableString(row.updated_at),
    userId,
    engagement,
    engagementStats,
    visibility: {
      show_academic: row.show_academic !== false,
      show_affiliation: row.show_affiliation !== false,
      show_age: row.show_age !== false,
      show_bio: row.show_bio !== false,
      show_gender: row.show_gender !== false,
      show_height: row.show_height !== false,
      show_languages: prefs.show_languages === true || row.show_languages === true,
      show_location: prefs.show_location === true || row.show_location === true,
      show_occupation: row.show_occupation !== false,
      show_orientation: row.show_orientation !== false,
      show_relationship_status: row.show_relationship_status !== false,
    },
  };
};

export async function blockNativePublicProfileUser(targetUserId: string, viewerId: string | null | undefined, accessToken: string | null) {
  const { error } = await nativeExactTokenRpc("block_user", {
    p_blocked_id: targetUserId,
  }, accessToken);
  if (!error) return;
  throw new Error(error.message || "Unable to block user right now");
}

export type SendNativePublicProfileWaveResult = {
  status: "sent" | "duplicate" | "blocked" | "quota_exhausted" | "failed";
  mutual: boolean;
  matchCreated: boolean;
};

async function areNativeUsersBlocked(_viewerId: string, targetUserId: string, accessToken?: string | null) {
  const data = await nativePublicProfileRpc<unknown>("get_native_public_profile_relationship", {
    p_target_user_id: targetUserId,
  }, accessToken);
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return row.blocked === true;
}

export async function fetchNativePublicProfileIsFriend(targetUserId: string, accessToken?: string | null) {
  const data = await nativePublicProfileRpc<unknown>("get_native_public_profile_relationship", {
    p_target_user_id: targetUserId,
  }, accessToken);
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return row.active_match === true && row.blocked !== true;
}

async function checkNativeReciprocalWave(_viewerId: string, targetUserId: string, accessToken?: string | null) {
  return nativePublicProfileRpc<boolean>("has_native_reciprocal_wave", {
    p_target_user_id: targetUserId,
  }, accessToken);
}

async function finalizeNativeMutualWave(targetUserId: string, accessToken?: string | null) {
  const data = await nativePublicProfileRpc<unknown>("accept_mutual_wave", { p_target_user_id: targetUserId }, accessToken);
  if (Array.isArray(data) && data.length > 0) {
    return (data[0] as { match_created?: unknown } | null)?.match_created === true;
  }
  return false;
}

export async function sendNativePublicProfileWave(viewerId: string, targetUserId: string, actionId: string, accessToken?: string | null): Promise<SendNativePublicProfileWaveResult> {
  try {
    const rpcData = await nativePublicProfileRpc<unknown>("send_native_discovery_wave_atomic", {
      p_target_user_id: targetUserId,
      p_action_id: actionId,
    }, accessToken);
    {
      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { status?: unknown; mutual?: unknown; match_created?: unknown } | null;
      const status = String(row?.status || "failed");
      if (status === "blocked") return { status: "blocked", mutual: false, matchCreated: false };
      if (status === "quota_exhausted") return { status: "quota_exhausted", mutual: false, matchCreated: false };
      if (status === "duplicate" || status === "sent") {
        return {
          status: status as "duplicate" | "sent",
          mutual: row?.mutual === true,
          matchCreated: row?.match_created === true,
        };
      }
    }
    return { status: "failed", mutual: false, matchCreated: false };
  } catch (error) {
    return { status: "failed", mutual: false, matchCreated: false };
  }
}

const normalizeStarTier = (value: unknown): "free" | "plus" | "gold" => {
  const normalized = String(value || "free").trim().toLowerCase();
  if (normalized.includes("gold")) return "gold";
  if (normalized.includes("plus") || normalized.includes("premium")) return "plus";
  return "free";
};

const starLimitForTier = (tier: "free" | "plus" | "gold") => {
  if (tier === "gold") return 10;
  if (tier === "plus") return 4;
  return 0;
};

const numberValue = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const nullablePositiveInteger = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const buildNativeStarIntroPayload = (senderId: string, recipientId: string) => JSON.stringify({
  kind: "star_intro",
  sender_id: senderId,
  recipient_id: recipientId,
  text: "Star connection started.",
  created_at: new Date().toISOString(),
});

export type SendNativePublicProfileStarResult =
  | { status: "sent"; roomId: string }
  | { status: "free_tier"; roomId: null }
  | { status: "exhausted"; roomId: null; upgradeTier: "gold" | null }
  | { status: "blocked"; roomId: null }
  | { status: "failed"; roomId: null; reason: string };

const nativeErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    const message = ((error as { message?: string }).message || "").trim();
    if (message) return message;
  }
  return fallback;
};

const isNativeStarUnreachableError = (error: unknown) => {
  const message = nativeErrorMessage(error, "").toLowerCase();
  return /blocked_relationship|unmatched_relationship|target_unavailable|cannot_chat_with_self|target_required/.test(message);
};

export async function sendNativePublicProfileStarChat(viewerId: string, targetUserId: string, targetName: string, actionId: string, accessToken: string | null): Promise<SendNativePublicProfileStarResult> {
  if (viewerId === targetUserId) return { status: "failed", roomId: null, reason: "Cannot send a Star to yourself." };
  try {
    const token = await getFreshNativeAccessToken(accessToken);
    if (!token) throw new Error("auth_required");
    const [{ profile }, quotaSnapshot] = await Promise.all([
      fetchNativeProfileSummary(viewerId, { force: true, accessToken: token }),
      nativeExactTokenRpc("get_quota_snapshot", {}, token),
    ]);
    const tier = normalizeStarTier(profile?.effective_tier ?? profile?.tier);
    if (tier === "free") return { status: "free_tier", roomId: null };
    if (quotaSnapshot.error) throw quotaSnapshot.error;
    const quota = Array.isArray(quotaSnapshot.data) ? quotaSnapshot.data[0] : quotaSnapshot.data;
    const typedQuota = quota && typeof quota === "object" ? quota as Record<string, unknown> : {};
    const used = numberValue(typedQuota.stars_used_cycle ?? typedQuota.stars_month_used);
    const extra = numberValue(typedQuota.extra_stars ?? typedQuota.extras_stars);
    if (Math.max(0, starLimitForTier(tier) - used) + Math.max(0, extra) <= 0) {
      return { status: "exhausted", roomId: null, upgradeTier: tier === "plus" ? "gold" : null };
    }
    const { data: atomicResult, error: atomicError } = await nativeExactTokenRpc("send_native_discovery_star_atomic", {
      p_target_user_id: targetUserId,
      p_target_name: targetName,
      p_content: buildNativeStarIntroPayload(viewerId, targetUserId),
      p_action_id: actionId,
    }, token);
    if (atomicError) {
      if (isNativeStarUnreachableError(atomicError)) return { status: "blocked", roomId: null };
      throw atomicError;
    }
    const typedAtomicResult = atomicResult && typeof atomicResult === "object"
      ? atomicResult as { status?: unknown; room_id?: unknown }
      : {};
    if (typedAtomicResult.status === "quota_exhausted") {
      return { status: "exhausted", roomId: null, upgradeTier: tier === "plus" ? "gold" : null };
    }
    const roomId = String(typedAtomicResult.room_id || "").trim();
    if (!roomId) return { status: "failed", roomId: null, reason: "Unable to send Star right now. Try again in a moment." };
    return { status: "sent", roomId };
  } catch (error) {
    if (isNativeStarUnreachableError(error)) return { status: "blocked", roomId: null };
    return { status: "failed", roomId: null, reason: "Unable to send Star right now. Try again in a moment." };
  }
}


const PUBLIC_PROFILE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const publicProfileMemoryCache = new Map<string, { value: NativePublicProfile | null; cachedAt: number }>();
const publicProfileInFlight = new Map<string, Promise<NativePublicProfile | null>>();
const publicPetMemoryCache = new Map<string, { value: NativePetDetailsData | null; cachedAt: number }>();
const publicPetInFlight = new Map<string, Promise<NativePetDetailsData | null>>();
let legacyPublicPrivacyPurge: Promise<void> | null = null;

type NativePublicCacheScope = {
  sessionKey?: string | null;
  viewerId?: string | null;
};

const publicCacheScopeKey = (scope?: NativePublicCacheScope) => {
  const viewer = cleanString(scope?.viewerId) || "anon";
  const session = cleanString(scope?.sessionKey) || `${viewer}:0`;
  return `${viewer}:${session}`;
};

const publicProfileCacheKey = (userId: string, scope?: NativePublicCacheScope) =>
  `native-public-profile:v4:${publicCacheScopeKey(scope)}:${userId}`;
const publicPetCacheKey = (petId: string, scope?: NativePublicCacheScope) =>
  `native-public-profile-pet:v3:${publicCacheScopeKey(scope)}:${petId}`;

const purgeLegacyPublicProfileCaches = () => {
  if (legacyPublicPrivacyPurge) return legacyPublicPrivacyPurge;
  legacyPublicPrivacyPurge = (async () => {
    const keys = await readNativeDisplayCacheKeys();
    const legacyKeys = keys.filter((key) => (
      key.startsWith("native-public-profile:v2:") ||
      key.startsWith("native-public-profile:v3:") ||
      key.startsWith("native-public-profile-pet:v2:")
    ));
    if (legacyKeys.length > 0) await AsyncStorage.multiRemove(legacyKeys).catch(() => undefined);
  })();
  return legacyPublicPrivacyPurge;
};

const readPersistentCache = async <T,>(key: string): Promise<T | null | undefined> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { cachedAt?: number; value?: T | null };
    if (typeof parsed.cachedAt !== "number" || Date.now() - parsed.cachedAt > PUBLIC_PROFILE_CACHE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    return parsed.value ?? null;
  } catch {
    await AsyncStorage.removeItem(key);
    return undefined;
  }
};

const writePersistentCache = async <T,>(key: string, value: T | null) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const removePersistentCache = async (key: string) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const invalidateNativePublicProfileCaches = async (scope: { petId?: string | null; userId?: string | null } = {}) => {
  const petId = cleanString(scope.petId);
  const userId = cleanString(scope.userId);
  if (!petId && !userId) {
    publicProfileMemoryCache.clear();
    publicProfileInFlight.clear();
    publicPetMemoryCache.clear();
    publicPetInFlight.clear();
    return;
  }

  for (const key of Array.from(publicProfileMemoryCache.keys())) {
    if (userId && key.endsWith(`:${userId}`)) publicProfileMemoryCache.delete(key);
  }
  for (const key of Array.from(publicProfileInFlight.keys())) {
    if (userId && key.endsWith(`:${userId}`)) publicProfileInFlight.delete(key);
  }
  for (const key of Array.from(publicPetMemoryCache.keys())) {
    if ((petId && key.endsWith(`:${petId}`)) || (userId && key.endsWith(`:owner:${userId}`))) publicPetMemoryCache.delete(key);
  }
  for (const key of Array.from(publicPetInFlight.keys())) {
    if ((petId && key.endsWith(`:${petId}`)) || (userId && key.endsWith(`:owner:${userId}`))) publicPetInFlight.delete(key);
  }

  const keys = await readNativeDisplayCacheKeys();
  const removals = keys.filter((key) => (
    (userId && /^native-public-profile:v[23]:/.test(key) && key.endsWith(`:${userId}`)) ||
    (petId && key.startsWith("native-public-profile-pet:v2:") && key.endsWith(`:${petId}`)) ||
    (userId && key.startsWith("native-public-profile-pet:v2:") && key.endsWith(`:owner:${userId}`))
  ));
  if (removals.length > 0) await AsyncStorage.multiRemove(removals).catch(() => undefined);
};

export const fetchNativePublicProfile = async ({
  accessToken,
  fallbackData = null,
  fallbackName = null,
  force = false,
  profileUserId,
  requireCanonical = false,
  sessionKey = null,
  viewerId = null,
}: {
  accessToken?: string | null;
  fallbackData?: ProfileRow | null;
  fallbackName?: string | null;
  force?: boolean;
  profileUserId: string | null;
  requireCanonical?: boolean;
  sessionKey?: string | null;
  viewerId?: string | null;
}) => {
  const cleanUserId = cleanString(profileUserId);
  if (!cleanUserId) return null;
  void purgeLegacyPublicProfileCaches();
  const cacheKey = publicProfileCacheKey(cleanUserId, { sessionKey, viewerId });

  if (!force && !requireCanonical) {
    const cachedMemory = publicProfileMemoryCache.get(cacheKey);
    if (cachedMemory?.value && Date.now() - cachedMemory.cachedAt <= PUBLIC_PROFILE_CACHE_MAX_AGE_MS) return cachedMemory.value;

    const persistent = await readPersistentCache<NativePublicProfile>(cacheKey);
    if (persistent) {
      publicProfileMemoryCache.set(cacheKey, { value: persistent, cachedAt: Date.now() });
      return persistent;
    }
  }

  const existing = publicProfileInFlight.get(cacheKey);
  if (!force && !requireCanonical && existing) return existing;

  const request = (async () => {
    let resolvedRow: ProfileRow | null = null;
    try {
      resolvedRow = await fetchNativePublicProfileRow(cleanUserId, accessToken);
    } catch (error) {
      publicProfileFetchLog("profile_row_failed", {
        code: error instanceof NativePublicProfileFetchError ? error.code : "unknown",
        force,
        hasFallbackData: Boolean(fallbackData),
        message: error instanceof Error ? error.message : String(error),
        userId: cleanUserId,
      });
      resolvedRow = null;
    }
    if (requireCanonical && !resolvedRow) return null;

    const visibleFallbackData = fallbackData ?? { id: cleanUserId, display_name: fallbackName || "User" };

    const petHeads = (Array.isArray(resolvedRow?.pet_heads) ? resolvedRow.pet_heads as Array<Record<string, unknown>> : [])
      .filter((pet) => pet.is_active !== false)
      .map((pet) => ({
        id: cleanString(pet.id),
        name: nullableString(pet.name),
        species: nullableString(pet.species),
        age_years: nullableAgeYears(pet.age_years, pet.dob),
        photoUrl: nullableString(pet.photo_url),
        photoPosition: (() => {
          const presentation = pet.photo_presentation;
          if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
          const home = (presentation as { home?: unknown }).home;
          if (!home || typeof home !== "object" || Array.isArray(home)) return null;
          const { centerX, centerY, widthPct, sourceAspect } = home as { centerX?: unknown; centerY?: unknown; widthPct?: unknown; sourceAspect?: unknown };
          return typeof centerX === "number" && typeof centerY === "number" ? { centerX, centerY, widthPct: typeof widthPct === "number" ? widthPct : 100, ...(typeof sourceAspect === "number" ? { sourceAspect } : {}) } : null;
        })(),
        is_public: pet.is_public === true,
        updated_at: nullableString(pet.updated_at),
      }));

    const value = await mapNativePublicProfile(
      mergeProfileRows(visibleFallbackData, { ...(resolvedRow ?? {}), pet_heads: petHeads }),
      fallbackName,
      accessToken,
    );

    publicProfileMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
    void writePersistentCache(cacheKey, value);
    return value;
  })().finally(() => {
    if (publicProfileInFlight.get(cacheKey) === request) publicProfileInFlight.delete(cacheKey);
  });

  publicProfileInFlight.set(cacheKey, request);
  return request;
};

export const fetchNativePublicProfilePet = async (
  petId: string,
  accessToken?: string | null,
  options: NativePublicCacheScope & { force?: boolean } = {},
): Promise<NativePetDetailsData | null> => {
  const cleanPetId = cleanString(petId);
  if (!cleanPetId) return null;
  void purgeLegacyPublicProfileCaches();
  const cacheKey = publicPetCacheKey(cleanPetId, options);

  if (!options.force) {
    const cachedMemory = publicPetMemoryCache.get(cacheKey);
    if (cachedMemory?.value && Date.now() - cachedMemory.cachedAt <= PUBLIC_PROFILE_CACHE_MAX_AGE_MS) return cachedMemory.value;

    const persistent = await readPersistentCache<NativePetDetailsData>(cacheKey);
    if (persistent) {
      publicPetMemoryCache.set(cacheKey, { value: persistent, cachedAt: Date.now() });
      return persistent;
    }
  }

  const existing = publicPetInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    let data: ProfileRow | null = null;
    try {
      data = await fetchNativePublicPetRow({ accessToken, petId: cleanPetId });
    } catch (error) {
      publicProfileFetchLog("pet_row_failed", {
        code: error instanceof NativePublicProfileFetchError ? error.code : "unknown",
        force: options.force === true,
        message: error instanceof Error ? error.message : String(error),
        petId: cleanPetId,
      });
    }
    const value = data ? mapNativePetDetailsRow(data) : null;
    if (value) {
      publicPetMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
      void writePersistentCache(cacheKey, value);
    } else {
      const cachedMemory = publicPetMemoryCache.get(cacheKey);
      if (cachedMemory?.value) return cachedMemory.value;
      const persistent = await readPersistentCache<NativePetDetailsData>(cacheKey);
      if (persistent) return persistent;
    }
    return value;
  })().finally(() => {
    if (publicPetInFlight.get(cacheKey) === request) publicPetInFlight.delete(cacheKey);
  });

  publicPetInFlight.set(cacheKey, request);
  return request;
};

export const fetchNativePublicProfileOwnerPet = async (
  ownerId: string,
  accessToken?: string | null,
  options: NativePublicCacheScope & { force?: boolean } = {},
): Promise<NativePetDetailsData | null> => {
  const cleanOwnerId = cleanString(ownerId);
  if (!cleanOwnerId) return null;
  void purgeLegacyPublicProfileCaches();
  const cacheKey = publicPetCacheKey(`owner:${cleanOwnerId}`, options);

  if (!options.force) {
    const cachedMemory = publicPetMemoryCache.get(cacheKey);
    if (cachedMemory?.value && Date.now() - cachedMemory.cachedAt <= PUBLIC_PROFILE_CACHE_MAX_AGE_MS) return cachedMemory.value;

    const persistent = await readPersistentCache<NativePetDetailsData>(cacheKey);
    if (persistent) {
      publicPetMemoryCache.set(cacheKey, { value: persistent, cachedAt: Date.now() });
      return persistent;
    }
  }

  const existing = publicPetInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    let data: ProfileRow | null = null;
    try {
      data = await fetchNativePublicPetRow({ accessToken, ownerId: cleanOwnerId });
    } catch (error) {
      publicProfileFetchLog("owner_pet_row_failed", {
        code: error instanceof NativePublicProfileFetchError ? error.code : "unknown",
        force: options.force === true,
        message: error instanceof Error ? error.message : String(error),
        ownerId: cleanOwnerId,
      });
    }
    const value = data ? mapNativePetDetailsRow(data) : null;
    if (value) {
      publicPetMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
      void writePersistentCache(cacheKey, value);
    } else {
      const cachedMemory = publicPetMemoryCache.get(cacheKey);
      if (cachedMemory?.value) return cachedMemory.value;
      const persistent = await readPersistentCache<NativePetDetailsData>(cacheKey);
      if (persistent) return persistent;
    }
    return value;
  })().finally(() => {
    if (publicPetInFlight.get(cacheKey) === request) publicPetInFlight.delete(cacheKey);
  });

  publicPetInFlight.set(cacheKey, request);
  return request;
};
