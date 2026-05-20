import type { NativePetDetailsData } from "../components/NativePetDetailsContent";
import {
  normalizeNativeProfilePhotos,
  resolveNativeProfilePhotos,
  type NativeProfilePhotos,
} from "./nativeProfilePhotos";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

export type NativePublicProfilePetHead = {
  dob?: string | null;
  id: string;
  isPublic?: boolean | null;
  name?: string | null;
  photoUrl?: string | null;
  species?: string | null;
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

export type NativePublicProfile = {
  affiliation: string;
  availabilityStatus: string[];
  bio: string;
  createdAt: string | null;
  degree: string;
  displayName: string;
  dob: string;
  experienceYears: string;
  gender: string;
  hasCar: boolean;
  height: string;
  isVerified: boolean;
  lastActiveAt: string | null;
  languages: string[];
  locationName: string;
  major: string;
  memberSince: string | null;
  membershipTier: string | null;
  nonSocial: boolean;
  occupation: string;
  orientation: string;
  petExperience: string[];
  petHeads: NativePublicProfilePetHead[];
  photoUrl: string | null;
  photos: NativeProfilePhotos;
  resolvedPhotoUrls: NativeResolvedProfilePhotoUrls;
  relationshipStatus: string;
  school: string;
  socialAlbum: string[];
  socialId: string | null;
  userId: string;
  visibility: NativePublicProfileVisibility;
};

type ProfileRow = Record<string, unknown>;

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const requireNativePublicProfileAccessToken = (accessToken?: string | null) => {
  const token = cleanString(accessToken);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const nativePublicProfileHeaders = (accessToken: string, extra?: Record<string, string>) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: supabaseAnonKey,
  ...extra,
});

const nativePublicProfileRpc = async <T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, requireNativePublicProfileAccessToken(accessToken));
  if (error) throw error;
  return data as T;
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
    const socialSignMatch = pathname.match(/\/storage\/v1\/object\/sign\/social_album\/(.+)$/);
    if (socialSignMatch?.[1]) return sanitizePathLike(socialSignMatch[1]);
    const socialPublicMatch = pathname.match(/\/storage\/v1\/object\/public\/social_album\/(.+)$/);
    if (socialPublicMatch?.[1]) return sanitizePathLike(socialPublicMatch[1]);
    const profilePublicMatch = pathname.match(/\/storage\/v1\/object\/public\/(profile_photos|Profiles)\/(.+)$/);
    if (profilePublicMatch?.[1] && profilePublicMatch?.[2]) {
      const path = sanitizePathLike(profilePublicMatch[2]);
      return path.startsWith(`${profilePublicMatch[1]}/`) ? path : `${profilePublicMatch[1]}/${path}`;
    }
    const profileSignMatch = pathname.match(/\/storage\/v1\/object\/sign\/(profile_photos|Profiles)\/(.+)$/);
    if (profileSignMatch?.[1] && profileSignMatch?.[2]) {
      const path = sanitizePathLike(profileSignMatch[2]);
      return path.startsWith(`${profileSignMatch[1]}/`) ? path : `${profileSignMatch[1]}/${path}`;
    }
    const genericMatch = pathname.match(/\/social_album\/(.+)$/);
    if (genericMatch?.[1]) return sanitizePathLike(genericMatch[1]);
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
    return extracted ? sanitizePathLike(extracted).replace(/^(social_album\/)+/i, "") : null;
  }
  if (!raw.includes("/")) return null;
  return sanitizePathLike(raw).replace(/^(social_album\/)+/i, "") || null;
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
  if (Array.isArray(row.availability_status) && row.availability_status.length > 0) {
    const roles = row.availability_status
      .map((item) => String(item || "").trim())
      .filter((item) => Boolean(item) && item.toLowerCase() !== "free");
    if (roles.length > 0) return roles;
  }
  const socialRole = cleanString(row.social_role ?? row.user_role);
  if (socialRole && socialRole.toLowerCase() !== "free") return [socialRole];
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
        dob: nullableString(record.dob),
        photoUrl: nullableString(record.photoUrl) ?? nullableString(record.photo_url),
        isPublic: typeof record.isPublic === "boolean" ? record.isPublic : record.is_public !== false,
      });
      return null;
    });
  return heads;
};

export const mapNativePublicProfile = async (
  row: ProfileRow,
  fallbackName?: string | null,
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

  return {
    affiliation: cleanString(row.affiliation),
    availabilityStatus: normalizeNativeAvailabilityStatus(row),
    bio: cleanString(row.bio),
    createdAt: nullableString(row.created_at),
    degree: cleanString(row.degree),
    displayName: cleanString(row.display_name) || cleanString(fallbackName) || "User",
    dob: cleanString(row.dob),
    experienceYears: cleanString(experienceYearsValue),
    gender: cleanString(row.gender_genre),
    hasCar: row.has_car === true,
    height: row.height == null ? "" : String(row.height),
    isVerified: isNativeVerifiedProfile(row),
    lastActiveAt: nullableString(row.last_active_at) ?? nullableString(row.updated_at),
    languages: isStringArray(row.languages) ? row.languages : [],
    locationName: cleanString(row.location_name),
    major: cleanString(row.major),
    memberSince: nullableString(row.created_at) ?? nullableString(row.member_since),
    membershipTier: nullableString(row.effective_tier) ?? nullableString(row.tier),
    nonSocial: row.non_social === true,
    occupation: cleanString(row.occupation),
    orientation: cleanString(row.orientation),
    petExperience: isStringArray(row.pet_experience) ? row.pet_experience : [],
    petHeads: normalizeNativePetHeads(row.pet_heads),
    photoUrl: nullableString(row.avatar_url),
    photos,
    resolvedPhotoUrls,
    relationshipStatus: cleanString(row.relationship_status),
    school: cleanString(row.school),
    socialAlbum,
    socialId: nullableString(row.social_id),
    userId,
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
  const token = requireNativePublicProfileAccessToken(accessToken);
  const { error } = await nativeExactTokenRpc("block_user", {
    p_blocked_id: targetUserId,
  }, token);
  if (!error) return;
  throw new Error(error.message || "Unable to block user right now");
}

export async function fetchNativeProfileMemberNumber(userId: string, createdAt?: string | null, accessToken?: string | null): Promise<number | null> {
  const cleanUserId = cleanString(userId);
  const token = requireNativePublicProfileAccessToken(accessToken);
  if (!cleanUserId) return null;
  const cleanCreatedAt = cleanString(createdAt);
  if (cleanCreatedAt) {
    const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
    url.searchParams.set("created_at", `lte.${cleanCreatedAt}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");
    const response = await fetch(url.toString(), {
      method: "HEAD",
      headers: nativePublicProfileHeaders(token, { Prefer: "count=exact" }),
    });
    if (response.ok) {
      const contentRange = response.headers.get("content-range") || "";
      const count = Number(contentRange.split("/").pop());
      if (Number.isFinite(count) && count > 0) return count;
    }
  }
  const data = await nativePublicProfileRpc<unknown>("get_native_public_profile_snapshot", {
    p_user_id: cleanUserId,
  }, token);
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const value = Number(row.member_number ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type SendNativePublicProfileWaveResult = {
  status: "sent" | "duplicate" | "blocked" | "failed";
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

async function hasNativeActiveMatch(_viewerId: string, targetUserId: string, accessToken?: string | null) {
  const data = await nativePublicProfileRpc<unknown>("get_native_public_profile_relationship", {
    p_target_user_id: targetUserId,
  }, accessToken);
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return row.active_match === true;
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

export async function sendNativePublicProfileWave(viewerId: string, targetUserId: string, accessToken?: string | null): Promise<SendNativePublicProfileWaveResult> {
  requireNativePublicProfileAccessToken(accessToken);
  try {
    const rpcData = await nativePublicProfileRpc<unknown>("send_discovery_wave", { p_target_user_id: targetUserId }, accessToken);
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      const row = rpcData[0] as { status?: unknown; mutual?: unknown; match_created?: unknown } | null;
      const status = String(row?.status || "failed");
      if (status === "blocked") return { status: "blocked", mutual: false, matchCreated: false };
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

export async function sendNativePublicProfileStarChat(viewerId: string, targetUserId: string, targetName: string, accessToken: string | null): Promise<SendNativePublicProfileStarResult> {
  const token = requireNativePublicProfileAccessToken(accessToken);
  if (viewerId === targetUserId) return { status: "failed", roomId: null, reason: "Cannot send a Star to yourself." };
  try {
    const [{ profile }, quotaSnapshot] = await Promise.all([
      fetchNativeProfileSummary(viewerId, { force: false, accessToken: token }),
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
    const { data: atomicRoomId, error: atomicError } = await nativeExactTokenRpc("send_star_chat_atomic", {
      p_target_user_id: targetUserId,
      p_target_name: targetName,
      p_content: buildNativeStarIntroPayload(viewerId, targetUserId),
    }, token);
    if (atomicError) {
      if (isNativeStarUnreachableError(atomicError)) return { status: "blocked", roomId: null };
      throw atomicError;
    }
    const roomId = String(atomicRoomId || "").trim();
    if (!roomId) return { status: "failed", roomId: null, reason: "Unable to send Star right now. Try again in a moment." };
    const { error: notificationError } = await nativeExactTokenRpc("enqueue_notification", {
      p_user_id: targetUserId,
      p_category: "chats",
      p_kind: "star",
      p_title: "New star",
      p_body: "Someone sent you a Star ⭐ Tap to find out who.",
      p_href: `/chat-dialogue?room=${roomId}&with=${viewerId}`,
      p_data: { room_id: roomId, from_user_id: viewerId, type: "star" },
    }, token);
    if (notificationError) {
      console.warn("[native.publicProfile] star_notification_enqueue_failed", notificationError);
    }
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
  `native-public-profile:v2:${publicCacheScopeKey(scope)}:${userId}`;
const publicPetCacheKey = (petId: string, scope?: NativePublicCacheScope) =>
  `native-public-profile-pet:v2:${publicCacheScopeKey(scope)}:${petId}`;

const readPersistentCache = async <T,>(key: string): Promise<T | null | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(key);
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

export const fetchNativePublicProfile = async ({
  accessToken,
  fallbackData = null,
  fallbackName = null,
  force = false,
  sessionKey = null,
  userId,
  viewerId = null,
}: {
  accessToken?: string | null;
  fallbackData?: ProfileRow | null;
  fallbackName?: string | null;
  force?: boolean;
  sessionKey?: string | null;
  userId: string;
  viewerId?: string | null;
}) => {
  const cleanUserId = cleanString(userId);
  if (!cleanUserId) return null;
  requireNativePublicProfileAccessToken(accessToken);
  const cacheKey = publicProfileCacheKey(cleanUserId, { sessionKey, viewerId });

  if (!force) {
    const cachedMemory = publicProfileMemoryCache.get(cacheKey);
    if (cachedMemory?.value && Date.now() - cachedMemory.cachedAt <= PUBLIC_PROFILE_CACHE_MAX_AGE_MS) return cachedMemory.value;

    const persistent = await readPersistentCache<NativePublicProfile>(cacheKey);
    if (persistent) {
      publicProfileMemoryCache.set(cacheKey, { value: persistent, cachedAt: Date.now() });
      return persistent;
    }
  }

  const existing = publicProfileInFlight.get(cacheKey);
  if (!force && existing) return existing;

  const request = (async () => {
    const data = await nativePublicProfileRpc<unknown>("get_native_public_profile_snapshot", {
      p_user_id: cleanUserId,
    }, accessToken);
    const snapshot = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const resolvedRow = snapshot.profile && typeof snapshot.profile === "object" ? snapshot.profile as ProfileRow : null;

    if (!resolvedRow && !fallbackData) {
      publicProfileMemoryCache.delete(cacheKey);
      void removePersistentCache(cacheKey);
      return null;
    }

    const petHeads = (Array.isArray(resolvedRow?.pet_heads) ? resolvedRow.pet_heads as Array<Record<string, unknown>> : [])
      .filter((pet) => pet.is_active !== false)
      .map((pet) => ({
        id: cleanString(pet.id),
        name: nullableString(pet.name),
        species: nullableString(pet.species),
        dob: nullableString(pet.dob),
        photoUrl: nullableString(pet.photo_url),
        is_public: pet.is_public === true,
      }));

    const value = await mapNativePublicProfile(
      mergeProfileRows(fallbackData, { ...(resolvedRow ?? {}), pet_heads: petHeads }),
      fallbackName,
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
  requireNativePublicProfileAccessToken(accessToken);
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
    const data = await nativePublicProfileRpc<ProfileRow | null>("get_native_public_profile_pet", {
      p_pet_id: cleanPetId,
      p_owner_id: null,
    }, accessToken);
    const value = data ? mapNativePetDetailsRow(data) : null;
    if (value) {
      publicPetMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
      void writePersistentCache(cacheKey, value);
    } else {
      publicPetMemoryCache.delete(cacheKey);
      void removePersistentCache(cacheKey);
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
  requireNativePublicProfileAccessToken(accessToken);
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
  const data = await nativePublicProfileRpc<ProfileRow | null>("get_native_public_profile_pet", {
    p_pet_id: null,
    p_owner_id: cleanOwnerId,
  }, accessToken);
    const value = data ? mapNativePetDetailsRow(data) : null;
    if (value) {
      publicPetMemoryCache.set(cacheKey, { value, cachedAt: Date.now() });
      void writePersistentCache(cacheKey, value);
    } else {
      publicPetMemoryCache.delete(cacheKey);
      void removePersistentCache(cacheKey);
    }
    return value;
  })().finally(() => {
    if (publicPetInFlight.get(cacheKey) === request) publicPetInFlight.delete(cacheKey);
  });

  publicPetInFlight.set(cacheKey, request);
  return request;
};
