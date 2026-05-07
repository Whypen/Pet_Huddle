import type { NativePetDetailsData } from "../components/NativePetDetailsContent";
import {
  normalizeNativeProfilePhotos,
  resolveNativeProfilePhotos,
  type NativeProfilePhotos,
} from "./nativeProfilePhotos";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { supabase } from "./supabase";

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

const PUBLIC_PROFILE_SELECT = "id, display_name, avatar_url, availability_status, user_role, has_car, location_name, last_active_at";

type NativeMaybeSingleQuery<T> = {
  select: (columns: string) => {
    limit: (count: number) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: T | null; error?: { message?: string } | null }>;
      };
    };
  };
};

type NativePetHeadQuery = {
  select: (columns: string) => {
    limit: (count: number) => {
      eq: (column: string, value: unknown) => Promise<{ data: ProfileRow[] | null; error?: { message?: string } | null }>;
    };
  };
};

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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
    isVerified: row.is_verified === true || cleanString(row.verification_status).toLowerCase() === "verified",
    lastActiveAt: nullableString(row.last_active_at),
    languages: isStringArray(row.languages) ? row.languages : [],
    locationName: cleanString(row.location_name),
    major: cleanString(row.major),
    memberSince: nullableString(row.created_at),
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

export async function blockNativePublicProfileUser(targetUserId: string, viewerId?: string | null) {
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)("block_user", {
    p_blocked_id: targetUserId,
  });
  if (!error) return;
  if (!viewerId) throw new Error(error.message || "Unable to block user right now");
  const fallback = await supabase.from("user_blocks").upsert(
    {
      blocker_id: viewerId,
      blocked_id: targetUserId,
    },
    { onConflict: "blocker_id,blocked_id" },
  );
  if (fallback.error) throw new Error(fallback.error.message || error.message || "Unable to block user right now");
}

export async function fetchNativeProfileMemberNumber(userId: string, createdAt?: string | null): Promise<number | null> {
  const cleanUserId = cleanString(userId);
  if (!cleanUserId) return null;
  let memberSince = cleanString(createdAt);
  if (!memberSince) {
    const profileQuery = supabase.from("profiles") as unknown as NativeMaybeSingleQuery<ProfileRow>;
    const { data } = await profileQuery.select("created_at").limit(1).eq("id", cleanUserId).maybeSingle();
    memberSince = cleanString(data?.created_at);
  }
  if (!memberSince) return null;
  const earlier = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .lt("created_at", memberSince);
  const sameInstant = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("created_at", memberSince)
    .lte("id", cleanUserId);
  if (earlier.error || sameInstant.error) return null;
  return (earlier.count ?? 0) + (sameInstant.count ?? 0) || null;
}

const isWaveSchemaFallbackError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return message.includes("column") || message.includes("schema cache") || message.includes("relationship");
};

const isDuplicateWaveError = (error: unknown) => {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate") || message.includes("already");
};

export type SendNativePublicProfileWaveResult = {
  status: "sent" | "duplicate" | "blocked" | "failed";
  mutual: boolean;
  matchCreated: boolean;
};

async function areNativeUsersBlocked(viewerId: string, targetUserId: string) {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .or(`and(blocker_id.eq.${viewerId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${viewerId})`)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function areNativeUsersUnmatched(viewerId: string, targetUserId: string) {
  const { data, error } = await supabase
    .from("user_unmatches")
    .select("id")
    .or(`and(actor_id.eq.${viewerId},target_id.eq.${targetUserId}),and(actor_id.eq.${targetUserId},target_id.eq.${viewerId})`)
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function hasNativeActiveMatch(viewerId: string, targetUserId: string) {
  const [a, b] = await Promise.all([
    supabase.from("matches").select("id").eq("user1_id", viewerId).eq("user2_id", targetUserId).eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("matches").select("id").eq("user1_id", targetUserId).eq("user2_id", viewerId).eq("is_active", true).limit(1).maybeSingle(),
  ]);
  return Boolean((a.data as { id?: string } | null)?.id || (b.data as { id?: string } | null)?.id);
}

async function checkNativeReciprocalWave(viewerId: string, targetUserId: string) {
  const attempts: Array<{ fromCol: "from_user_id" | "sender_id"; toCol: "to_user_id" | "receiver_id" }> = [
    { fromCol: "sender_id", toCol: "receiver_id" },
    { fromCol: "from_user_id", toCol: "to_user_id" },
  ];
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("waves")
      .select("id")
      .eq(attempt.fromCol, targetUserId)
      .eq(attempt.toCol, viewerId)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isWaveSchemaFallbackError(error)) continue;
      return false;
    }
    if ((data as { id?: string } | null)?.id) return true;
    break;
  }
  return false;
}

async function finalizeNativeMutualWave(targetUserId: string) {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)("accept_mutual_wave", { p_target_user_id: targetUserId });
  if (error) {
    const message = String(error.message || "");
    if (/accept_mutual_wave/i.test(message) || /does not exist/i.test(message)) return false;
    throw error;
  }
  if (Array.isArray(data) && data.length > 0) {
    return (data[0] as { match_created?: unknown } | null)?.match_created === true;
  }
  return false;
}

export async function sendNativePublicProfileWave(viewerId: string, targetUserId: string): Promise<SendNativePublicProfileWaveResult> {
  try {
    if (await hasNativeActiveMatch(viewerId, targetUserId)) {
      return { status: "duplicate", mutual: false, matchCreated: false };
    }
    if (await areNativeUsersBlocked(viewerId, targetUserId)) {
      return { status: "blocked", mutual: false, matchCreated: false };
    }
    if (await areNativeUsersUnmatched(viewerId, targetUserId)) {
      return { status: "blocked", mutual: false, matchCreated: false };
    }

    const outgoingChecks: Array<{ fromCol: "sender_id" | "from_user_id"; toCol: "receiver_id" | "to_user_id" }> = [
      { fromCol: "sender_id", toCol: "receiver_id" },
      { fromCol: "from_user_id", toCol: "to_user_id" },
    ];
    for (const check of outgoingChecks) {
      const { data, error } = await supabase
        .from("waves")
        .select("id")
        .eq(check.fromCol, viewerId)
        .eq(check.toCol, targetUserId)
        .limit(1)
        .maybeSingle();
      if (error) {
        if (isWaveSchemaFallbackError(error)) continue;
        break;
      }
      if ((data as { id?: string } | null)?.id) {
        const mutual = await checkNativeReciprocalWave(viewerId, targetUserId);
        const matchCreated = mutual ? await finalizeNativeMutualWave(targetUserId) : false;
        return { status: "duplicate", mutual, matchCreated };
      }
      break;
    }

    const primary = await supabase.from("waves" as never).insert({
      sender_id: viewerId,
      receiver_id: targetUserId,
      status: "pending",
      wave_type: "standard",
    } as never);
    if (primary.error) {
      if (isDuplicateWaveError(primary.error)) throw primary.error;
      if (!isWaveSchemaFallbackError(primary.error)) throw primary.error;
      const fallback = await supabase.from("waves" as never).insert({
        from_user_id: viewerId,
        to_user_id: targetUserId,
        status: "pending",
        wave_type: "standard",
      } as never);
      if (fallback.error) {
        if (isDuplicateWaveError(fallback.error)) throw fallback.error;
        throw fallback.error;
      }
    }

    const mutual = await checkNativeReciprocalWave(viewerId, targetUserId);
    const matchCreated = mutual ? await finalizeNativeMutualWave(targetUserId) : false;
    return { status: "sent", mutual, matchCreated };
  } catch (error) {
    if (isDuplicateWaveError(error)) {
      const mutual = await checkNativeReciprocalWave(viewerId, targetUserId);
      const matchCreated = mutual ? await finalizeNativeMutualWave(targetUserId) : false;
      return { status: "duplicate", mutual, matchCreated };
    }
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

async function validateNativeStarDirectRoom(roomId: string, actorId: string, targetUserId: string) {
  const chatId = cleanString(roomId);
  const actor = cleanString(actorId);
  const target = cleanString(targetUserId);
  if (!chatId || !actor || !target) throw new Error("direct_room_invalid");
  if (actor === target) throw new Error("cannot_chat_with_self");
  const [blocked, unmatched] = await Promise.all([
    areNativeUsersBlocked(actor, target),
    areNativeUsersUnmatched(actor, target),
  ]);
  if (blocked) throw new Error("blocked_relationship");
  if (unmatched) throw new Error("unmatched_relationship");
  const [roomResult, memberResult] = await Promise.all([
    supabase.from("chats").select("id,type").eq("id", chatId).limit(1).maybeSingle(),
    supabase.from("chat_room_members").select("user_id").eq("chat_id", chatId),
  ]);
  const room = roomResult.data as { type?: string | null } | null;
  if (room?.type !== "direct") throw new Error("direct_room_type_mismatch");
  const memberIds = (memberResult.data || []).map((row: { user_id?: string | null }) => cleanString(row.user_id)).filter(Boolean);
  if (memberIds.length !== 2 || !memberIds.includes(actor) || !memberIds.includes(target)) {
    throw new Error("direct_room_member_mismatch");
  }
}

export type SendNativePublicProfileStarResult =
  | { status: "sent"; roomId: string }
  | { status: "free_tier"; roomId: null }
  | { status: "exhausted"; roomId: null; upgradeTier: "gold" | null }
  | { status: "blocked"; roomId: null }
  | { status: "failed"; roomId: null };

export async function sendNativePublicProfileStarChat(viewerId: string, targetUserId: string, targetName: string): Promise<SendNativePublicProfileStarResult> {
  if (viewerId === targetUserId) return { status: "failed", roomId: null };
  try {
    const [{ profile }, quotaSnapshot] = await Promise.all([
      fetchNativeProfileSummary(viewerId, { force: true }),
      (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot"),
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
    const [blocked, unmatched] = await Promise.all([
      areNativeUsersBlocked(viewerId, targetUserId),
      areNativeUsersUnmatched(viewerId, targetUserId),
    ]);
    if (blocked || unmatched) return { status: "blocked", roomId: null };
    const { data: atomicRoomId, error: atomicError } = await (supabase.rpc as unknown as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>)("send_star_chat_atomic", {
      p_target_user_id: targetUserId,
      p_target_name: targetName,
      p_content: buildNativeStarIntroPayload(viewerId, targetUserId),
    });
    if (atomicError) throw atomicError;
    const roomId = String(atomicRoomId || "").trim();
    if (!roomId) return { status: "exhausted", roomId: null, upgradeTier: tier === "plus" ? "gold" : null };
    await validateNativeStarDirectRoom(roomId, viewerId, targetUserId);
    void (supabase.rpc as unknown as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>)("enqueue_notification", {
      p_user_id: targetUserId,
      p_category: "chats",
      p_kind: "star",
      p_title: "New star",
      p_body: "Someone sent you a Star ⭐ Tap to find out who.",
      p_href: `/chat-dialogue?room=${roomId}&with=${viewerId}`,
      p_data: { room_id: roomId, from_user_id: viewerId, type: "star" },
    });
    return { status: "sent", roomId };
  } catch {
    return { status: "failed", roomId: null };
  }
}

export const fetchNativePublicProfile = async ({
  fallbackData = null,
  fallbackName = null,
  userId,
}: {
  fallbackData?: ProfileRow | null;
  fallbackName?: string | null;
  userId: string;
}) => {
  const profilesQuery = supabase.from("profiles") as unknown as NativeMaybeSingleQuery<ProfileRow>;
  const { data: profileRow, error } = await profilesQuery
    .select("*").limit(20)
    .eq("id", userId)
    .maybeSingle();

  let resolvedRow = profileRow as ProfileRow | null;
  if (error || !resolvedRow) {
    const publicProfilesQuery = supabase.from("profiles_public") as unknown as NativeMaybeSingleQuery<ProfileRow>;
    const { data: publicRow } = await publicProfilesQuery
      .select(PUBLIC_PROFILE_SELECT).limit(20)
      .eq("id", userId)
      .maybeSingle();
    resolvedRow = publicRow as ProfileRow | null;
  }

  if (!resolvedRow && !fallbackData) return null;

  const petHeadsQuery = supabase.from("pets") as unknown as NativePetHeadQuery;
  const { data: pets } = await petHeadsQuery
    .select("id, name, species, dob, photo_url, is_active, is_public").limit(20)
    .eq("owner_id", userId);
  const petHeads = ((pets as Array<Record<string, unknown>> | null) ?? [])
    .filter((pet) => pet.is_active !== false)
    .map((pet) => ({
      id: cleanString(pet.id),
      name: nullableString(pet.name),
      species: nullableString(pet.species),
      dob: nullableString(pet.dob),
      photoUrl: nullableString(pet.photo_url),
      is_public: pet.is_public === true,
    }));

  return mapNativePublicProfile(
    mergeProfileRows(fallbackData, { ...(resolvedRow ?? {}), pet_heads: petHeads }),
    fallbackName,
  );
};

export const fetchNativePublicProfilePet = async (petId: string): Promise<NativePetDetailsData | null> => {
  const cleanPetId = cleanString(petId);
  if (!cleanPetId) return null;
  const petQuery = supabase.from("pets") as unknown as NativeMaybeSingleQuery<ProfileRow>;
  const { data, error } = await petQuery
    .select("*").limit(20)
    .eq("id", cleanPetId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapNativePetDetailsRow(data) : null;
};
