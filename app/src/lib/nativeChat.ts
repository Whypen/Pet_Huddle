import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNativeCurrentCoordinates } from "./nativeLocation";
import { resolveNativeAvatarUrl } from "./nativeStorageUrlCache";
import { supabase } from "./supabase";

export const NATIVE_CHAT_TABLES = {
  rooms: "chats",
  members: "chat_room_members",
  messages: "chat_messages",
  reads: "message_reads",
} as const;

export const NATIVE_CHAT_ATTACHMENTS_BUCKET = "chat_attachments";
export const TEAM_HUDDLE_USER_ID = "8f55ab31-6b25-4d1a-98c7-3a6e8af2d941";
export const TEAM_HUDDLE_DISPLAY_NAME = "Team Huddle";
export const TEAM_HUDDLE_AVAILABILITY = "Safety Team";
const NATIVE_CHAT_INBOX_CACHE_MS = 8000;
const NATIVE_CHAT_UNREAD_CACHE_MS = 8000;

export type NativeChatRoomType = "direct" | "group" | "service" | string;
export type NativeChatInboxScope = "friends" | "groups" | "service" | "all";
export type NativeChatBlockState = "none" | "blocked_by_me" | "blocked_by_them";
export type NativeChatUnmatchState = "none" | "unmatched_by_me" | "unmatched_by_them";

export type NativeChatRoom = {
  id: string;
  type: NativeChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  visibility: string | null;
  joinMethod: string | null;
  roomCode: string | null;
  locationLabel: string | null;
  locationCountry: string | null;
  petFocus: string[];
  description: string | null;
};

export type NativeChatMember = {
  chatId: string;
  userId: string;
  createdAt: string | null;
  role: string | null;
};

export type NativeChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export type NativeChatRead = {
  id: string;
  chatId: string;
  messageId: string;
  userId: string;
  readAt: string | null;
};

export type NativeChatAttachment = {
  bucket: typeof NATIVE_CHAT_ATTACHMENTS_BUCKET;
  path: string;
  url: string;
  name: string;
  mime: string;
  size: number | null;
};

export type NativeChatRouteParams = {
  room: string | null;
  withUserId: string | null;
  name: string | null;
  joined: boolean;
};

export type NativeServiceChatRouteParams = {
  room: string | null;
  paid: string | null;
  payment: string | null;
  booking: string | null;
  request: string | null;
};

export type NativeChatInboxRow = {
  chatId: string;
  roomType: string;
  peerUserId: string | null;
  peerName: string | null;
  peerAvatarUrl: string | null;
  peerIsVerified: boolean;
  peerHasCar: boolean;
  peerAvailabilityLabel: string | null;
  peerSocialId: string | null;
  blockedByMe: boolean;
  blockedByThem: boolean;
  unmatchedByMe: boolean;
  unmatchedByThem: boolean;
  matchedAt: string | null;
  chatName: string | null;
  avatarUrl: string | null;
  memberCount: number;
  petFocus: string[];
  locationLabel: string | null;
  locationCountry: string | null;
  visibility: string | null;
  roomCode: string | null;
  joinMethod: string | null;
  description: string | null;
  createdAt: string | null;
  createdBy: string | null;
  lastMessageId: string | null;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  lastMessageContent: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessageReadByOther: boolean;
  serviceStatus: string | null;
  serviceRequesterId: string | null;
  serviceProviderId: string | null;
  serviceRequestCard: Record<string, unknown> | null;
  shapeIssue: string | null;
  activityTs: string | null;
};

export type NativeChatDiscoverStatus = "ready" | "age_blocked" | "location_required";

export type NativeChatDiscoveryProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  hasCar: boolean;
  bio: string | null;
  relationshipStatus: string | null;
  dob: string | null;
  age: number | null;
  locationName: string | null;
  locationCountry: string | null;
  gender: string | null;
  orientation: string | null;
  occupation: string | null;
  school: string | null;
  major: string | null;
  degree: string | null;
  height: number | null;
  lastLat: number | null;
  lastLng: number | null;
  tier: string | null;
  pets: Array<{ name?: string | null; species?: string | null }>;
  petSpecies: string[];
  petSize: string | null;
  petExperience: string[];
  petExperienceYears: number | null;
  languages: string[];
  socialAlbum: string[];
  socialRole: string | null;
  lastActiveAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  score: number;
};

export type NativeChatDiscoveryResult = {
  status: NativeChatDiscoverStatus;
  locationLabel: string | null;
  anchor: { lat: number; lng: number } | null;
  profiles: NativeChatDiscoveryProfile[];
};

export type NativeChatDiscoveryFilters = {
  ageMin: number;
  ageMax: number;
  genders: string[];
  maxDistanceKm: number;
  species: string[];
  socialRoles: string[];
  heightMin: number;
  heightMax: number;
  orientations: string[];
  degrees: string[];
  relationshipStatuses: string[];
  hasCar: boolean;
  experienceYearsMin: number;
  experienceYearsMax: number;
  languages: string[];
  verifiedOnly: boolean;
  whoWavedAtMe: boolean;
  activeOnly: boolean;
};

const nativeChatInboxCache = new Map<string, { rows: NativeChatInboxRow[]; ts: number }>();
const nativeChatInboxInFlight = new Map<string, Promise<NativeChatInboxRow[]>>();
let nativeChatUnreadCache: { total: number; ts: number } | null = null;
let nativeChatUnreadInFlight: Promise<number> | null = null;

export type NativeExploreGroup = {
  id: string;
  inviteId: string | null;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  petFocus: string[];
  locationLabel: string | null;
  locationCountry: string | null;
  locationDistrict: string | null;
  joinMethod: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string | null;
  lastMessageAt: string | null;
  visibility: string | null;
  roomCode: string | null;
  invitePending: boolean;
  inviterName: string | null;
  requested: boolean;
};

export type NativeGroupManagementSnapshot = {
  members: Array<{ userId: string; name: string | null; avatarUrl: string | null; role: string | null; isVerified: boolean; isMuted?: boolean }>;
  joinRequests: Array<{ id: string; userId: string; name: string | null; avatarUrl: string | null; status: string | null; isVerified: boolean }>;
  pendingInvites: Array<{ id: string; userId: string; name: string | null; avatarUrl: string | null; status: string | null; isVerified: boolean }>;
  mediaUrls: string[];
};

export async function fetchNativeGroupPreviewMembers(chatId: string): Promise<NativeGroupManagementSnapshot["members"]> {
  const roomId = cleanId(chatId);
  if (!roomId) return [];
  const { data, error } = await nativeChatRpc("get_public_group_preview_members", { p_chat_id: roomId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((value) => {
    const row = asRecord(value);
    return {
      userId: String(row.user_id || ""),
      name: cleanString(row.display_name),
      avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
      role: cleanString(row.role) || "member",
      isVerified: verifiedValue(row),
    };
  }).filter((member) => member.userId);
}

type NativeChatRpc = (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

const nativeChatRpc: NativeChatRpc = async (fn, params) => {
  const result = await supabase.rpc(fn, params);
  return result as { data: unknown; error: { message?: string } | null };
};
const ALL_NATIVE_DISCOVERY_SPECIES = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others", "None"];
const NATIVE_DISCOVERY_HEIGHT_MAX_CM = 300;

const asRecord = (value: unknown) => (value && typeof value === "object" ? value as Record<string, unknown> : {});
const cleanString = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};
const cleanId = cleanString;

const stringArray = (value: unknown) => Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];

const numberValue = (value: unknown) => {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
};

const booleanValue = (value: unknown) => value === true;
const dateRankValue = (value: string | null | undefined) => {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
};
const groupActivityRankValue = (lastMessageAt: string | null | undefined, createdAt: string | null | undefined) => (
  dateRankValue(lastMessageAt) || dateRankValue(createdAt)
);
const discoveryFallbackRankValue = (profile: NativeChatDiscoveryProfile) => (
  profile.score * 1_000_000 +
  (profile.isVerified ? 100_000 : 0) +
  (profile.tier?.toLowerCase() === "gold" ? 50_000 : profile.tier?.toLowerCase() === "plus" ? 25_000 : 0) +
  Math.min(groupActivityRankValue(profile.lastActiveAt || profile.updatedAt, profile.createdAt), 9_999_999_999_999) / 1_000_000
);
const verifiedValue = (row: Record<string, unknown>, boolKey = "is_verified", statusKey = "verification_status") => (
  booleanValue(row[boolKey]) || String(row[statusKey] || "").trim().toLowerCase() === "verified"
);
const normalizeIdentity = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export const isNativeTeamHuddleIdentity = (displayName: string | null | undefined, socialId: string | null | undefined) => {
  const name = normalizeIdentity(displayName);
  const social = normalizeIdentity(socialId).replace(/^@/, "");
  if (name === "team huddle") return true;
  return social === "teamhuddle" || social === "team_huddle" || social === "team-huddle" || social === "huddleteam" || social === "huddle_team";
};

const getSeenStorageKey = (userId: string) => `chat_room_seen_${userId}`;

const isRpcSignatureDrift = (error: { message?: string } | null | undefined) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("could not find the function") || message.includes("function") && message.includes("does not exist") || message.includes("schema cache");
};

const ageFromDob = (dob: unknown) => {
  const dobText = cleanString(dob);
  if (!dobText) return null;
  const birth = new Date(dobText);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
};

const firstFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null || value === "") continue;
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return null;
};

export const parseNativeChatRouteParams = (pathOrQuery: string): NativeChatRouteParams => {
  const query = pathOrQuery.includes("?") ? pathOrQuery.split("?").slice(1).join("?") : pathOrQuery;
  const params = new URLSearchParams(query);
  return {
    room: cleanId(params.get("room")),
    withUserId: cleanId(params.get("with")),
    name: cleanString(params.get("name")),
    joined: params.get("joined") === "1",
  };
};

export async function resolveNativeChatInboxRowNavigation(
  row: NativeChatInboxRow,
  ensureDirectRoom: (targetUserId: string, targetName: string) => Promise<string> = ensureNativeDirectChatRoom,
) {
  const name = row.roomType === "group"
    ? row.chatName || "Group chat"
    : row.roomType === "service"
      ? row.chatName || row.peerName || "Service chat"
      : row.peerName || row.chatName || "Conversation";

  if (row.roomType === "service") {
    return `/service-chat?room=${encodeURIComponent(row.chatId)}&name=${encodeURIComponent(name)}`;
  }

  if (row.roomType !== "group" && row.peerUserId) {
    const roomId = await ensureDirectRoom(row.peerUserId, name);
    return `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}&with=${encodeURIComponent(row.peerUserId)}`;
  }

  return `/chat-dialogue?room=${encodeURIComponent(row.chatId)}&name=${encodeURIComponent(name)}`;
}

export const parseNativeServiceChatRouteParams = (pathOrQuery: string): NativeServiceChatRouteParams => {
  const query = pathOrQuery.includes("?") ? pathOrQuery.split("?").slice(1).join("?") : pathOrQuery;
  const params = new URLSearchParams(query);
  return {
    room: cleanId(params.get("room")) || cleanId(params.get("roomId")),
    paid: cleanString(params.get("paid")),
    payment: cleanString(params.get("payment")),
    booking: cleanString(params.get("booking")),
    request: cleanString(params.get("request")),
  };
};

const mapRoom = (row: Record<string, unknown>): NativeChatRoom => ({
  id: String(row.id || ""),
  type: String(row.type || ""),
  name: cleanString(row.name),
  avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
  createdBy: cleanId(row.created_by),
  createdAt: cleanString(row.created_at),
  updatedAt: cleanString(row.updated_at),
  lastMessageAt: cleanString(row.last_message_at),
  visibility: cleanString(row.visibility),
  joinMethod: cleanString(row.join_method),
  roomCode: cleanString(row.room_code),
  locationLabel: cleanString(row.location_label),
  locationCountry: cleanString(row.location_country),
  petFocus: stringArray(row.pet_focus),
  description: cleanString(row.description),
});

const mapMember = (row: Record<string, unknown>): NativeChatMember => ({
  chatId: String(row.chat_id || ""),
  userId: String(row.user_id || ""),
  createdAt: cleanString(row.created_at),
  role: cleanString(row.role),
});

const mapMessage = (row: Record<string, unknown>): NativeChatMessage => ({
  id: String(row.id || ""),
  chatId: String(row.chat_id || ""),
  senderId: String(row.sender_id || ""),
  content: String(row.content || ""),
  createdAt: String(row.created_at || ""),
});

const mapRead = (row: Record<string, unknown>): NativeChatRead => ({
  id: String(row.id || ""),
  chatId: String(row.chat_id || ""),
  messageId: String(row.message_id || ""),
  userId: String(row.user_id || ""),
  readAt: cleanString(row.read_at),
});

const mapInboxRow = (value: unknown): NativeChatInboxRow => {
  const row = asRecord(value);
  return {
    chatId: String(row.chat_id || ""),
    roomType: String(row.room_type || ""),
    peerUserId: cleanId(row.peer_user_id),
    peerName: cleanString(row.peer_name),
    peerAvatarUrl: resolveNativeAvatarUrl(row.peer_avatar_url),
    peerIsVerified: verifiedValue(row, "peer_is_verified", "peer_verification_status"),
    peerHasCar: booleanValue(row.peer_has_car),
    peerAvailabilityLabel: cleanString(row.peer_availability_label),
    peerSocialId: cleanString(row.peer_social_id),
    blockedByMe: booleanValue(row.blocked_by_me),
    blockedByThem: booleanValue(row.blocked_by_them),
    unmatchedByMe: booleanValue(row.unmatched_by_me),
    unmatchedByThem: booleanValue(row.unmatched_by_them),
    matchedAt: cleanString(row.matched_at),
    chatName: cleanString(row.chat_name),
    avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
    memberCount: numberValue(row.member_count),
    petFocus: stringArray(row.pet_focus),
    locationLabel: cleanString(row.location_label),
    locationCountry: cleanString(row.location_country),
    visibility: cleanString(row.visibility),
    roomCode: cleanString(row.room_code),
    joinMethod: cleanString(row.join_method),
    description: cleanString(row.description),
    createdAt: cleanString(row.created_at),
    createdBy: cleanId(row.created_by),
    lastMessageId: cleanId(row.last_message_id),
    lastMessageSenderId: cleanId(row.last_message_sender_id),
    lastMessageSenderName: cleanString(row.last_message_sender_name),
    lastMessageContent: cleanString(row.last_message_content),
    lastMessageAt: cleanString(row.last_message_at),
    unreadCount: numberValue(row.unread_count),
    lastMessageReadByOther: booleanValue(row.last_message_read_by_other),
    serviceStatus: cleanString(row.service_status),
    serviceRequesterId: cleanId(row.service_requester_id),
    serviceProviderId: cleanId(row.service_provider_id),
    serviceRequestCard: row.service_request_card && typeof row.service_request_card === "object" ? row.service_request_card as Record<string, unknown> : null,
    shapeIssue: cleanString(row.shape_issue),
    activityTs: cleanString(row.activity_ts),
  };
};

const mapDiscoveryProfile = (value: unknown): NativeChatDiscoveryProfile => {
  const row = asRecord(value);
  const pets = Array.isArray(row.pets)
    ? row.pets.map((pet) => {
        const petRow = asRecord(pet);
        return { name: cleanString(petRow.name), species: cleanString(petRow.species) };
      })
    : [];
  const normalizeSocialRole = (role: string | null) => (
    /^animal friend\s*\(no pet\)$/i.test(String(role || "").trim()) ? "Animal Friend" : role
  );
  const socialRole = cleanString(row.social_role) || cleanString(Array.isArray(row.availability_status) ? row.availability_status[0] : null);
  return {
    id: String(row.id || ""),
    displayName: cleanString(row.display_name) || "Huddle member",
    avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
    isVerified: verifiedValue(row),
    hasCar: booleanValue(row.has_car),
    bio: cleanString(row.bio),
    relationshipStatus: cleanString(row.relationship_status),
    dob: cleanString(row.dob),
    age: ageFromDob(row.dob),
    locationName: cleanString(row.location_name),
    locationCountry: cleanString(row.location_country),
    gender: cleanString(row.gender_genre),
    orientation: cleanString(row.orientation),
    occupation: cleanString(row.occupation),
    school: cleanString(row.school),
    major: cleanString(row.major),
    degree: cleanString(row.degree),
    height: firstFiniteNumber(row.height),
    lastLat: firstFiniteNumber(row.last_lat),
    lastLng: firstFiniteNumber(row.last_lng),
    tier: cleanString(row.effective_tier) || cleanString(row.tier),
    pets,
    petSpecies: stringArray(row.pet_species),
    petSize: cleanString(row.pet_size),
    petExperience: stringArray(row.pet_experience),
    petExperienceYears: firstFiniteNumber(row.pet_experience_years, row.experience_years),
    languages: stringArray(row.languages),
    socialAlbum: stringArray(row.social_album).map(resolveNativeAvatarUrl).filter((url): url is string => Boolean(url)),
    socialRole: normalizeSocialRole(socialRole),
    lastActiveAt: cleanString(row.last_active_at),
    updatedAt: cleanString(row.updated_at),
    createdAt: cleanString(row.created_at),
    score: numberValue(row.score),
  };
};

export async function fetchNativeChatInbox(options: {
  scope: NativeChatInboxScope;
  chatIds?: string[];
  onlyWithActivity?: boolean | null;
  limit?: number;
  cursor?: string | null;
  force?: boolean;
}) {
  const key = JSON.stringify({
    chatIds: options.chatIds && options.chatIds.length > 0 ? [...options.chatIds].sort() : null,
    cursor: options.cursor ?? null,
    limit: options.limit ?? null,
    onlyWithActivity: options.onlyWithActivity ?? null,
    scope: options.scope,
  });
  const now = Date.now();
  const cached = nativeChatInboxCache.get(key);
  if (!options.force && cached && now - cached.ts < NATIVE_CHAT_INBOX_CACHE_MS) return cached.rows;
  const inFlight = nativeChatInboxInFlight.get(key);
  if (!options.force && inFlight) return inFlight;
  const promise = (async () => {
    const { data, error } = await nativeChatRpc("get_chat_inbox_summaries", {
      p_scope: options.scope,
      p_chat_ids: options.chatIds && options.chatIds.length > 0 ? options.chatIds : null,
      p_only_with_activity: options.onlyWithActivity ?? null,
      p_limit: options.limit ?? null,
      p_cursor: options.cursor ?? null,
    });
    if (error && isRpcSignatureDrift(error)) {
      const fallback = await nativeChatRpc("get_chat_inbox_summaries", {
        p_scope: options.scope,
        p_chat_ids: options.chatIds && options.chatIds.length > 0 ? options.chatIds : null,
      });
      if (fallback.error) throw fallback.error;
      const rows = (Array.isArray(fallback.data) ? fallback.data : []).map(mapInboxRow).filter((row) => row.chatId);
      nativeChatInboxCache.set(key, { rows, ts: Date.now() });
      return rows;
    }
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []).map(mapInboxRow).filter((row) => row.chatId);
    nativeChatInboxCache.set(key, { rows, ts: Date.now() });
    return rows;
  })().finally(() => {
    if (nativeChatInboxInFlight.get(key) === promise) nativeChatInboxInFlight.delete(key);
  });
  nativeChatInboxInFlight.set(key, promise);
  return promise;
}

export async function searchNativeChatInbox(query: string) {
  const { data, error } = await nativeChatRpc("search_chat_inbox", { p_query: query.trim() });
  if (error && isRpcSignatureDrift(error)) {
    const rows = await fetchNativeChatInbox({ scope: "all", onlyWithActivity: false, limit: 80 });
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [
      row.peerName,
      row.chatName,
      row.lastMessageContent,
      row.locationLabel,
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(mapInboxRow).filter((row) => row.chatId);
}

export async function fetchNativeChatUnreadTotal() {
  const now = Date.now();
  if (nativeChatUnreadCache && now - nativeChatUnreadCache.ts < NATIVE_CHAT_UNREAD_CACHE_MS) return nativeChatUnreadCache.total;
  if (nativeChatUnreadInFlight) return nativeChatUnreadInFlight;
  nativeChatUnreadInFlight = (async () => {
    const { data, error } = await nativeChatRpc("get_chat_inbox_unread_total", {});
    if (error && isRpcSignatureDrift(error)) {
      const rows = await fetchNativeChatInbox({ scope: "all", onlyWithActivity: true, limit: 80 });
      const total = rows.reduce((sum, row) => sum + row.unreadCount, 0);
      nativeChatUnreadCache = { total, ts: Date.now() };
      return total;
    }
    if (error) throw error;
    const total = numberValue(data);
    nativeChatUnreadCache = { total, ts: Date.now() };
    return total;
  })().finally(() => {
    nativeChatUnreadInFlight = null;
  });
  return nativeChatUnreadInFlight;
}

const mapExploreGroup = (value: unknown, options?: { invite?: Record<string, unknown>; requested?: boolean }): NativeExploreGroup => {
  const row = asRecord(value);
  const invite = options?.invite || {};
  return {
    id: String(row.id || row.chat_id || ""),
    inviteId: cleanId(invite.invite_id) || cleanId(row.invite_id),
    name: cleanString(row.name) || cleanString(row.chat_name) || "Group",
    avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
    memberCount: numberValue(row.member_count),
    petFocus: stringArray(row.pet_focus),
    locationLabel: cleanString(row.location_label),
    locationCountry: cleanString(row.location_country),
    locationDistrict: cleanString(row.location_district),
    joinMethod: cleanString(row.join_method) || "request",
    description: cleanString(row.description),
    createdBy: cleanId(row.created_by),
    createdAt: cleanString(row.created_at),
    lastMessageAt: cleanString(row.last_message_at),
    visibility: cleanString(row.visibility) || "public",
    roomCode: cleanString(row.room_code),
    invitePending: Boolean(options?.invite) || booleanValue(row.invite_pending),
    inviterName: cleanString(invite.inviter_name) || cleanString(row.inviter_name),
    requested: options?.requested === true,
  };
};

export async function fetchNativeExploreGroups(options: { userId: string; joinedGroupIds?: string[] }) {
  const userId = cleanId(options.userId);
  if (!userId) return { invited: [] as NativeExploreGroup[], groups: [] as NativeExploreGroup[] };
  const joinedIds = new Set((options.joinedGroupIds ?? []).map(cleanId).filter((id): id is string => Boolean(id)));
  const [{ data: requestRows }, { data: viewerProfile }, { data: viewerPets }, invitePreviewResult, publicGroupsResult] = await Promise.all([
    supabase.from("group_join_requests").select("chat_id").eq("user_id", userId).eq("status", "pending").limit(100),
    supabase.from("profiles").select("location_country,location_district,location_name").eq("id", userId).limit(1).maybeSingle(),
    supabase.from("pets").select("species").eq("owner_id", userId).eq("is_active", true).limit(50),
    nativeChatRpc("get_group_invite_previews", { p_user_id: userId }),
    nativeChatRpc("get_public_groups_for_viewer"),
  ]);
  if (invitePreviewResult.error) throw invitePreviewResult.error;
  if (publicGroupsResult.error) throw publicGroupsResult.error;
  const requestedIds = new Set(((requestRows ?? []) as Array<{ chat_id?: string | null }>).map((row) => cleanId(row.chat_id)).filter((id): id is string => Boolean(id)));
  const inviteMap = new Map<string, Record<string, unknown>>();
  for (const row of (Array.isArray(invitePreviewResult.data) ? invitePreviewResult.data : []) as Record<string, unknown>[]) {
    const chatId = cleanId(row.chat_id);
    if (chatId) inviteMap.set(chatId, row);
  }
  const invited = Array.from(inviteMap.values())
    .map((row) => mapExploreGroup({
      id: row.chat_id,
      name: row.chat_name,
      avatar_url: row.avatar_url,
      member_count: row.member_count,
      pet_focus: row.pet_focus,
      location_label: row.location_label,
      location_country: row.location_country,
      location_district: row.location_district,
      join_method: row.join_method,
      description: row.description,
      created_by: row.created_by,
      created_at: row.created_at,
      last_message_at: row.last_message_at,
      visibility: row.visibility,
      room_code: row.room_code,
    }, { invite: row, requested: false }))
    .filter((group) => group.id && !joinedIds.has(group.id));
  const invitedIds = new Set(invited.map((group) => group.id));
  const viewer = asRecord(viewerProfile);
  const viewerDistrict = cleanString(viewer.location_district) || cleanString(viewer.location_name);
  const userSpecies = (Array.isArray(viewerPets) ? viewerPets : [])
    .map((pet) => cleanString(asRecord(pet).species)?.toLowerCase())
    .filter((species): species is string => Boolean(species));
  const userLocWords = String(viewerDistrict || "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 2);
  const rankGroup = (group: NativeExploreGroup) => {
    const focusLower = group.petFocus.map((item) => item.toLowerCase());
    let petScore = 0;
    if (focusLower.includes("all pets")) {
      petScore = 1;
    } else if (userSpecies.length > 0 && userSpecies.some((species) => focusLower.some((focus) => focus.includes(species) || species.includes(focus)))) {
      petScore = 3;
    }
    const lastMessageMs = dateRankValue(group.lastMessageAt);
    const msSince = lastMessageMs > 0 ? Date.now() - lastMessageMs : Infinity;
    const activeScore = msSince < 86_400_000 ? 2 : msSince < 604_800_000 ? 1 : 0;
    const groupLocWords = String(group.locationLabel || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((word) => word.length > 2);
    const proxScore = userLocWords.length > 0 && groupLocWords.some((word) => userLocWords.includes(word)) ? 4 : 0;
    return proxScore + petScore * 3 + activeScore;
  };
  const sortByWebGroupActivity = (left: NativeExploreGroup, right: NativeExploreGroup) => (
    groupActivityRankValue(right.lastMessageAt, right.createdAt) - groupActivityRankValue(left.lastMessageAt, left.createdAt) ||
    dateRankValue(right.createdAt) - dateRankValue(left.createdAt)
  );
  invited.sort(sortByWebGroupActivity);
  const groups = (Array.isArray(publicGroupsResult.data) ? publicGroupsResult.data : [])
    .map((row) => {
      const group = mapExploreGroup(row, { requested: requestedIds.has(String(asRecord(row).id || "")) });
      return group;
    })
    .filter((group) => group.id && !joinedIds.has(group.id) && !invitedIds.has(group.id))
    .sort((left, right) => rankGroup(right) - rankGroup(left) || sortByWebGroupActivity(left, right));
  return { invited, groups };
}

export async function acceptNativeGroupInvite(options: { inviteId?: string | null; chatId: string }) {
  const inviteId = cleanId(options.inviteId);
  let chatId = cleanId(options.chatId);
  if (!chatId && inviteId) {
    const { data, error } = await supabase
      .from("group_chat_invites" as never)
      .select("chat_id" as never)
      .eq("id" as never, inviteId as never)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    chatId = cleanId(asRecord(data).chat_id);
  }
  if (!chatId) throw new Error("missing_group_invite");
  if (chatId) {
    const room = await fetchNativeChatRoom(chatId);
    if (room?.type !== "group") throw new Error("group_room_required");
  }
  const { data, error } = inviteId
    ? await nativeChatRpc("accept_group_chat_invite_by_id", { p_invite_id: inviteId })
    : await nativeChatRpc("accept_group_chat_invite", { p_chat_id: chatId });
  if (error) throw error;
  const joined = Array.isArray(data) ? booleanValue(asRecord(data[0]).joined) : false;
  if (!joined) throw new Error("group_invite_unavailable");
}

export async function declineNativeGroupInvite(options: { inviteId?: string | null; chatId: string; userId: string }) {
  const inviteId = cleanId(options.inviteId);
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!userId || (!inviteId && !chatId)) throw new Error("missing_group_invite");
  let query = supabase
    .from("group_chat_invites" as never)
    .update({ status: "declined" } as never)
    .eq("invitee_user_id" as never, userId as never)
    .eq("status" as never, "pending" as never);
  query = inviteId ? query.eq("id" as never, inviteId as never) : query.eq("chat_id" as never, chatId as never);
  const { error } = await query;
  if (error) throw error;
}

export async function requestNativeGroupJoin(options: { userId: string; chatId: string }) {
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!chatId || !userId) throw new Error("missing_group_join");
  await validateNativeGroupRoom(chatId);
  const { error } = await supabase
    .from("group_join_requests")
    .insert({ chat_id: chatId, user_id: userId, status: "pending" });
  if (error && error.code !== "23505") throw error;
}

export async function joinNativePublicGroup(options: { userId: string; chatId: string }) {
  const userId = cleanId(options.userId);
  const chatId = cleanId(options.chatId);
  if (!userId || !chatId) throw new Error("missing_group_join");
  await validateNativeGroupRoom(chatId);
  const { error } = await nativeChatRpc("join_native_group_member", { p_chat_id: chatId, p_user_id: userId, p_role: "member" });
  if (error) throw error;
  void nativeChatRpc("post_group_welcome_message", { p_chat_id: chatId, p_user_id: userId });
  void nativeChatRpc("notify_group_join", { p_chat_id: chatId, p_user_id: userId });
}

export async function joinNativeGroupByCode(options: { userId: string; code: string }) {
  const code = String(options.code || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!code) throw new Error("missing_group_code");
  const { data, error } = await nativeChatRpc("join_private_group_by_code", { p_code: code });
  if (error) throw error;
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  const joined = booleanValue(row.joined);
  const chatId = cleanId(row.chat_id);
  if (!joined || !chatId) throw new Error(cleanString(row.reason) || "group_code_not_found");
  await validateNativeGroupRoom(chatId);
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", options.userId)
    .limit(1)
    .maybeSingle();
  const profileRow = asRecord(profile);
  const displayName = cleanString(profileRow.display_name) || "Someone";
  void supabase.from(NATIVE_CHAT_TABLES.messages).insert({
    chat_id: chatId,
    sender_id: options.userId,
    content: JSON.stringify({ kind: "membership", text: `${displayName} has joined the group!` }),
  });
  return { chatId, name: cleanString(row.chat_name) || "Group" };
}

export async function createNativeGroupChat(options: {
  userId: string;
  name: string;
  description?: string | null;
  joinMethod: "instant" | "request";
  visibility: "public" | "private";
  avatarUrl?: string | null;
  locationLabel?: string | null;
  locationCountry?: string | null;
  petFocus?: string[];
  inviteUserIds?: string[];
}) {
  const userId = cleanId(options.userId);
  const name = cleanString(options.name);
  if (!userId) throw new Error("missing_user");
  if (!name) throw new Error("missing_group_name");
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.rooms)
    .insert({
      type: "group",
      name,
      avatar_url: cleanString(options.avatarUrl),
      description: cleanString(options.description),
      join_method: options.visibility === "public" ? options.joinMethod : "request",
      visibility: options.visibility,
      location_label: cleanString(options.locationLabel),
      location_country: cleanString(options.locationCountry),
      pet_focus: options.petFocus && options.petFocus.length > 0 ? options.petFocus : null,
      created_by: userId,
    })
    .select("id,name,room_code")
    .single();
  if (error) throw error;
  const chatId = cleanId(asRecord(data).id);
  if (!chatId) throw new Error("group_not_created");
  const { error: membershipError } = await nativeChatRpc("join_native_group_member", { p_chat_id: chatId, p_user_id: userId, p_role: "admin" });
  if (membershipError) {
    console.warn("[native.chat] group_membership_aux_write_failed", { chatId, message: membershipError.message });
  }
  const roomCode = cleanString(asRecord(data).room_code);
  const systemText =
    options.visibility === "private"
      ? `Room Code: ${roomCode || "--"}`
      : options.joinMethod === "request"
      ? "This is a public group. People can request to join and you approve them."
      : "This is a public group. Anyone can join instantly.";
  void supabase.from(NATIVE_CHAT_TABLES.messages).insert({
    chat_id: chatId,
    sender_id: userId,
    content: JSON.stringify({ kind: "system", text: systemText }),
  });
  const inviteRows = Array.from(new Set((options.inviteUserIds ?? []).map(cleanId).filter((id): id is string => Boolean(id) && id !== userId)))
    .map((inviteeId) => ({
      chat_id: chatId,
      chat_name: name,
      inviter_user_id: userId,
      invitee_user_id: inviteeId,
      status: "pending",
    }));
  if (inviteRows.length > 0) {
    const { error: inviteError } = await supabase
      .from("group_chat_invites" as never)
      .upsert(inviteRows as never, { onConflict: "chat_id,invitee_user_id", ignoreDuplicates: false });
    if (inviteError) {
      console.warn("[native.chat] group_invite_aux_write_failed", { chatId, message: inviteError.message });
    }
  }
  return { chatId, name };
}

export async function fetchNativeGroupManagementSnapshot(chatId: string): Promise<NativeGroupManagementSnapshot> {
  const roomId = cleanId(chatId);
  if (!roomId) return { members: [], joinRequests: [], pendingInvites: [], mediaUrls: [] };
  const [membersResult, requestsResult, invitesResult, mediaResult] = await Promise.all([
    nativeChatRpc("get_native_group_members", { p_chat_id: roomId }),
    supabase.from("group_join_requests").select("id,user_id,status,profiles:profiles!group_join_requests_user_id_fkey(display_name,avatar_url,is_verified,verification_status)").eq("chat_id", roomId).eq("status", "pending").limit(50),
    supabase.from("group_chat_invites" as never).select("id,invitee_user_id,status,profiles:profiles!group_chat_invites_invitee_user_id_fkey(display_name,avatar_url,is_verified,verification_status)" as never).eq("chat_id" as never, roomId as never).eq("status" as never, "pending" as never).limit(50),
    supabase.from(NATIVE_CHAT_TABLES.messages).select("content,created_at").eq("chat_id", roomId).order("created_at", { ascending: false }).limit(80),
  ]);
  const profileOf = (row: Record<string, unknown>) => asRecord(Array.isArray(row.profiles) ? row.profiles[0] : row.profiles);
  return {
    members: (((membersResult.data || []) as unknown) as Record<string, unknown>[]).map((row) => {
      return { userId: String(row.user_id || ""), role: cleanString(row.role), name: cleanString(row.display_name), avatarUrl: resolveNativeAvatarUrl(row.avatar_url), isVerified: verifiedValue(row), isMuted: row.is_muted === true };
    }).filter((row) => row.userId),
    joinRequests: (((requestsResult.data || []) as unknown) as Record<string, unknown>[]).map((row) => {
      const profile = profileOf(row);
      return { id: String(row.id || ""), userId: String(row.user_id || ""), status: cleanString(row.status), name: cleanString(profile.display_name), avatarUrl: resolveNativeAvatarUrl(profile.avatar_url), isVerified: verifiedValue(profile) };
    }).filter((row) => row.id && row.userId),
    pendingInvites: (((invitesResult.data || []) as unknown) as Record<string, unknown>[]).map((row) => {
      const profile = profileOf(row);
      return { id: String(row.id || ""), userId: String(row.invitee_user_id || ""), status: cleanString(row.status), name: cleanString(profile.display_name), avatarUrl: resolveNativeAvatarUrl(profile.avatar_url), isVerified: verifiedValue(profile) };
    }).filter((row) => row.id && row.userId),
    mediaUrls: (((mediaResult.data || []) as unknown) as Record<string, unknown>[]).flatMap((row) => {
      try {
        const parsed = JSON.parse(String(row.content || "{}")) as { attachments?: Array<{ url?: string | null; mime?: string | null }> };
        return (parsed.attachments || [])
          .filter((attachment) => String(attachment.mime || "").startsWith("image/") || attachment.url)
          .map((attachment) => String(attachment.url || "").trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    }).slice(0, 12),
  };
}

export async function updateNativeGroupJoinRequest(options: { chatId: string; requestId: string; userId: string; action: "approve" | "decline" }) {
  const requestId = cleanId(options.requestId);
  if (!requestId) throw new Error("missing_group_request");
  const { error } = await nativeChatRpc(options.action === "approve" ? "approve_group_join_request" : "decline_group_join_request", { p_request_id: requestId });
  if (error) throw error;
}

export async function removeNativeGroupMember(options: { chatId: string; userId: string }) {
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!chatId || !userId) throw new Error("missing_group_member");
  const { error } = await nativeChatRpc("remove_native_group_member", { p_chat_id: chatId, p_user_id: userId });
  if (error) throw error;
}

export async function removeNativeGroupChat(chatId: string) {
  const roomId = cleanId(chatId);
  if (!roomId) throw new Error("missing_group");
  const { error } = await nativeChatRpc("remove_group_chat", { p_chat_id: roomId });
  if (error) throw error;
}

export async function setNativeGroupMuteState(options: { chatId: string; muted: boolean }) {
  const chatId = cleanId(options.chatId);
  if (!chatId) throw new Error("missing_group");
  const { error } = await nativeChatRpc("set_group_mute_state", { p_chat_id: chatId, p_muted: options.muted });
  if (error) throw error;
}

export async function inviteNativeGroupMembers(options: { chatId: string; chatName: string; inviterUserId: string; inviteUserIds: string[] }) {
  const chatId = cleanId(options.chatId);
  const inviterUserId = cleanId(options.inviterUserId);
  if (!chatId || !inviterUserId) throw new Error("missing_group_invite");
  const rows = Array.from(new Set(options.inviteUserIds.map(cleanId).filter((id): id is string => Boolean(id) && id !== inviterUserId)))
    .map((inviteeUserId) => ({
      chat_id: chatId,
      chat_name: cleanString(options.chatName) || "Group",
      inviter_user_id: inviterUserId,
      invitee_user_id: inviteeUserId,
      status: "pending",
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("group_chat_invites" as never)
    .upsert(rows as never, { onConflict: "chat_id,invitee_user_id", ignoreDuplicates: false });
  if (error) throw error;
}

export async function fetchNativeChatDiscoveryProfiles(
  userId: string,
  filters?: Partial<NativeChatDiscoveryFilters>,
  options?: { effectiveTier?: string | null },
): Promise<NativeChatDiscoveryResult> {
  const viewerId = cleanId(userId);
  if (!viewerId) return { status: "location_required", locationLabel: null, anchor: null, profiles: [] };
  const deviceCoords = await getNativeCurrentCoordinates().catch(() => null);
  const viewerResult = await supabase
    .from("profiles")
    .select("id,dob,last_lat,last_lng,location_name,location_district,location_country,location_pinned_until")
    .eq("id", viewerId)
    .limit(1)
    .maybeSingle();
  const safeViewerResult = viewerResult.error
    ? await supabase
        .from("profiles")
        .select("id,dob,location_name,location_country")
        .eq("id", viewerId)
        .limit(1)
        .maybeSingle()
    : viewerResult;
  if (safeViewerResult.error) return { status: "location_required", locationLabel: null, anchor: null, profiles: [] };
  const viewerRow = asRecord(safeViewerResult.data);
  const viewerAge = ageFromDob(viewerRow.dob);
  if (viewerAge !== null && viewerAge < 16) {
    return { status: "age_blocked", locationLabel: null, anchor: null, profiles: [] };
  }
  const liveLocationResult = await supabase
    .from("user_locations")
    .select("location,location_name")
    .eq("user_id", viewerId)
    .eq("is_public", true)
    .limit(1)
    .maybeSingle();
  const liveLocation = asRecord(liveLocationResult.data);
  const livePoint = asRecord(liveLocation.location);
  const liveCoords = Array.isArray(livePoint.coordinates) ? livePoint.coordinates : [];
  const pinnedUntilMs = cleanString(viewerRow.location_pinned_until) ? new Date(String(viewerRow.location_pinned_until)).getTime() : Number.NaN;
  const profilePinActive = Number.isFinite(pinnedUntilMs) && pinnedUntilMs > Date.now();
  const lat = profilePinActive ? firstFiniteNumber(viewerRow.last_lat, liveCoords[1], deviceCoords?.lat) : firstFiniteNumber(liveCoords[1], deviceCoords?.lat, viewerRow.last_lat);
  const lng = profilePinActive ? firstFiniteNumber(viewerRow.last_lng, liveCoords[0], deviceCoords?.lng) : firstFiniteNumber(liveCoords[0], deviceCoords?.lng, viewerRow.last_lng);
  const locationLabel =
    cleanString(liveLocation.location_name) ||
    cleanString(viewerRow.location_name) ||
    cleanString(viewerRow.location_district) ||
    cleanString(viewerRow.location_country);
  if (!deviceCoords || lat === null || lng === null) {
    return { status: "location_required", locationLabel, anchor: null, profiles: [] };
  }
  const tier = String(options?.effectiveTier || "free").trim().toLowerCase();
  const isPremium = tier === "plus" || tier === "gold";
  const selectedSpecies = filters?.species ?? [];
  const speciesFilter = selectedSpecies.length === 0 || selectedSpecies.length === ALL_NATIVE_DISCOVERY_SPECIES.length ? null : selectedSpecies;
  const hasExplicitHeightFilter =
    isPremium && ((filters?.heightMin ?? 100) > 100 || (filters?.heightMax ?? NATIVE_DISCOVERY_HEIGHT_MAX_CM) < NATIVE_DISCOVERY_HEIGHT_MAX_CM);
  const loadWaveCounterpartIds = async ({
    selectAttempts,
    viewerColumns,
    counterpartColumns,
    status,
  }: {
    selectAttempts: string[];
    viewerColumns: string[];
    counterpartColumns: string[];
    status?: string;
  }) => {
    for (const selectCols of selectAttempts) {
      for (const viewerColumn of viewerColumns) {
        let query = supabase
          .from("waves" as never)
          .select(selectCols as never)
          .eq(viewerColumn as never, viewerId as never)
          .limit(1000);
        if (status) query = query.eq("status" as never, status as never);
        const { data: rows, error: waveError } = await query;
        if (waveError) continue;
        return (((rows || []) as unknown) as Array<Record<string, unknown>>)
          .map((row) => {
            for (const column of counterpartColumns) {
              const id = cleanId(row[column]);
              if (id) return id;
            }
            return null;
          })
          .filter((id): id is string => Boolean(id));
      }
    }
    return [];
  };
  const outgoingWaveSelectAttempts = ["to_user_id, receiver_id", "to_user_id", "receiver_id"];
  const incomingWaveSelectAttempts = ["from_user_id, sender_id", "from_user_id", "sender_id"];
  const acceptedWaveSelectAttempts = [
    "from_user_id,to_user_id,sender_id,receiver_id,status",
    "sender_id,receiver_id,status",
    "from_user_id,to_user_id,status",
  ];
  const [sentWaveIds, receivedWaveIds, acceptedSentWaveIds, acceptedReceivedWaveIds, matchResult, blockResult, unmatchResult] = await Promise.all([
    loadWaveCounterpartIds({
      selectAttempts: outgoingWaveSelectAttempts,
      viewerColumns: ["from_user_id", "sender_id"],
      counterpartColumns: ["to_user_id", "receiver_id"],
    }),
    loadWaveCounterpartIds({
      selectAttempts: incomingWaveSelectAttempts,
      viewerColumns: ["to_user_id", "receiver_id"],
      counterpartColumns: ["from_user_id", "sender_id"],
    }),
    loadWaveCounterpartIds({
      selectAttempts: acceptedWaveSelectAttempts,
      viewerColumns: ["sender_id", "from_user_id"],
      counterpartColumns: ["receiver_id", "to_user_id"],
      status: "accepted",
    }),
    loadWaveCounterpartIds({
      selectAttempts: acceptedWaveSelectAttempts,
      viewerColumns: ["receiver_id", "to_user_id"],
      counterpartColumns: ["sender_id", "from_user_id"],
      status: "accepted",
    }),
    supabase.from("matches" as never).select("user1_id,user2_id" as never).or(`user1_id.eq.${viewerId},user2_id.eq.${viewerId}`).eq("is_active" as never, true as never).limit(1000),
    supabase.from("user_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`).limit(1000),
    supabase.from("user_unmatches").select("actor_id,target_id").or(`actor_id.eq.${viewerId},target_id.eq.${viewerId}`).limit(1000),
  ]);
  if (blockResult.error || unmatchResult.error) throw new Error("relationship_filter_unavailable");
  const handledIds = new Set<string>();
  sentWaveIds.forEach((id) => handledIds.add(id));
  acceptedSentWaveIds.forEach((id) => handledIds.add(id));
  acceptedReceivedWaveIds.forEach((id) => handledIds.add(id));
  const outgoingWaveTargetIds = new Set(sentWaveIds);
  receivedWaveIds.forEach((id) => {
    if (outgoingWaveTargetIds.has(id)) handledIds.add(id);
  });
  (((matchResult.data || []) as unknown) as Array<{ user1_id?: string | null; user2_id?: string | null }>).forEach((row) => {
    const id = row.user1_id === viewerId ? cleanId(row.user2_id) : cleanId(row.user1_id);
    if (id) handledIds.add(id);
  });
  const restrictedIds = new Set<string>();
  (((blockResult.data || []) as unknown) as Array<{ blocker_id?: string | null; blocked_id?: string | null }>).forEach((row) => {
    const id = row.blocker_id === viewerId ? cleanId(row.blocked_id) : cleanId(row.blocker_id);
    if (id) restrictedIds.add(id);
  });
  (((unmatchResult.data || []) as unknown) as Array<{ actor_id?: string | null; target_id?: string | null }>).forEach((row) => {
    const id = row.actor_id === viewerId ? cleanId(row.target_id) : cleanId(row.actor_id);
    if (id) restrictedIds.add(id);
  });
  const wavedAtViewerIds = new Set(receivedWaveIds);
  const guardProfiles = (profiles: NativeChatDiscoveryProfile[]) => profiles
    .filter((profile) => !restrictedIds.has(profile.id))
    .filter((profile) => !handledIds.has(profile.id))
    .filter((profile) => filters?.whoWavedAtMe === true ? wavedAtViewerIds.has(profile.id) : true);
  const { data, error } = await nativeChatRpc("social_discovery_restricted", {
    p_user_id: viewerId,
    p_lat: lat,
    p_lng: lng,
    p_radius_m: Math.max(1000, Math.round((filters?.maxDistanceKm ?? 150) * 1000)),
    p_min_age: Math.max(16, filters?.ageMin ?? 16),
    p_max_age: Math.max(Math.max(16, filters?.ageMin ?? 16), filters?.ageMax ?? 99),
    p_role: null,
    p_gender: filters?.genders?.length === 1 ? filters.genders[0] : null,
    p_species: speciesFilter,
    p_pet_size: null,
    p_advanced: isPremium,
    p_height_min: hasExplicitHeightFilter ? filters?.heightMin : null,
    p_height_max: hasExplicitHeightFilter ? filters?.heightMax : null,
    p_only_waved: filters?.whoWavedAtMe === true,
    p_active_only: filters?.activeOnly === true,
  });
  if (error || isRpcSignatureDrift(error)) {
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,bio,dob,relationship_status,orientation,gender_genre,occupation,school,major,degree,height,has_car,verification_status,is_verified,pet_experience,experience_years,languages,effective_tier,tier,availability_status,last_active_at,updated_at,created_at,last_lat,last_lng,location_name,location_country")
      .neq("id", viewerId)
      .limit(80);
    if (fallbackError) throw fallbackError;
	    const fallbackProfiles = guardProfiles((fallbackRows || []).map(mapDiscoveryProfile))
	      .filter((profile) => {
	        if (filters?.verifiedOnly && !profile.isVerified) return false;
	        if (filters?.hasCar && !profile.hasCar) return false;
	        if (filters?.genders?.length && profile.gender && !filters.genders.includes(profile.gender)) return false;
	        if (profile.age !== null && (profile.age < (filters?.ageMin ?? 16) || profile.age > (filters?.ageMax ?? 99))) return false;
	        if (isPremium && profile.height !== null && (profile.height < (filters?.heightMin ?? 100) || profile.height > (filters?.heightMax ?? NATIVE_DISCOVERY_HEIGHT_MAX_CM))) return false;
	        return true;
	      })
	      .sort((left, right) =>
	        discoveryFallbackRankValue(right) - discoveryFallbackRankValue(left) ||
	        String(left.displayName || "").localeCompare(String(right.displayName || ""))
	      );
    return { status: "ready", locationLabel, anchor: { lat, lng }, profiles: fallbackProfiles };
  }
  const rawRows = (Array.isArray(data) ? data : [])
    .map((value) => asRecord(value))
    .filter((row) => cleanId(row.id) && cleanId(row.id) !== viewerId);
  const profileIds = rawRows.map((row) => cleanId(row.id)).filter((id): id is string => Boolean(id));
  const enrichmentById = new Map<string, Record<string, unknown>>();
  if (profileIds.length > 0) {
    const { data: enrichmentRows } = await supabase
      .from("profiles")
      .select("id,pet_experience,experience_years,degree,languages,height,has_car,verification_status,is_verified,relationship_status,orientation,gender_genre,availability_status,last_active_at,updated_at,created_at,last_lat,last_lng,location_name,location_district,location_country")
      .in("id", profileIds);
    (Array.isArray(enrichmentRows) ? enrichmentRows : []).forEach((row) => {
      const record = asRecord(row);
      const id = cleanId(record.id);
      if (id) enrichmentById.set(id, record);
    });
  }
  const profiles = guardProfiles(rawRows.map((row) => {
    const id = cleanId(row.id);
    return mapDiscoveryProfile({ ...row, ...(id ? enrichmentById.get(id) : null) });
  }));
  return {
    status: "ready",
    locationLabel,
    anchor: { lat, lng },
    profiles,
  };
}

export async function ensureNativeDirectChatRoom(targetUserId: string, targetName: string) {
  const target = cleanId(targetUserId);
  if (!target) throw new Error("missing_target_user");
  const targetLabel = targetName || "Conversation";
  const payloadVariants: Array<Record<string, unknown>> = [
    { p_target_user_id: target, p_target_name: targetLabel },
    { target_user_id: target, target_name: targetLabel },
    { p_other_user_id: target, p_target_name: targetLabel },
    { other_user_id: target, target_name: targetLabel },
    { p_target_user_id: target, name: targetLabel },
  ];
  const isRpcMissing = (message: string) => {
    const normalized = message.toLowerCase();
    return normalized.includes("could not find the function") || normalized.includes("not found") || normalized.includes("does not exist");
  };
  const isContractRejection = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("active_match_required") ||
      normalized.includes("blocked_relationship") ||
      normalized.includes("unmatched_relationship") ||
      normalized.includes("cannot_chat_with_self") ||
      normalized.includes("target_required") ||
      normalized.includes("not_authenticated")
    );
  };
  const { data: sessionData } = await supabase.auth.getSession();
  const actorId = cleanId(sessionData.session?.user.id);
  if (!actorId) throw new Error("not_authenticated");
  await assertNativeDirectRelationshipAllowed(actorId, target);
  let lastRpcError: string | null = null;
  for (const payload of payloadVariants) {
    const { data, error } = await nativeChatRpc("ensure_direct_chat_room", payload);
    if (!error && data) {
      const roomId = cleanId(data);
      if (roomId) {
        await validateNativeDirectRoom(roomId, actorId, target);
        return roomId;
      }
    }
    const message = String(error?.message || "");
    lastRpcError = message || lastRpcError;
    if (message && !isRpcMissing(message) && isContractRejection(message)) throw new Error(message);
  }

  try {
    const { data: myMemberships } = await supabase.from(NATIVE_CHAT_TABLES.members).select("chat_id").eq("user_id", actorId);
    const myRoomIds = [...new Set((myMemberships || []).map((row: { chat_id?: string | null }) => cleanId(row.chat_id)).filter((id): id is string => Boolean(id)))];
    if (myRoomIds.length > 0) {
      const { data: targetMemberships } = await supabase.from(NATIVE_CHAT_TABLES.members).select("chat_id").eq("user_id", target).in("chat_id", myRoomIds);
      const overlaps = [...new Set((targetMemberships || []).map((row: { chat_id?: string | null }) => cleanId(row.chat_id)).filter((id): id is string => Boolean(id)))];
      if (overlaps.length > 0) {
        const { data: rooms } = await supabase
          .from(NATIVE_CHAT_TABLES.rooms)
          .select("id,type,last_message_at,created_at")
          .in("id", overlaps)
          .eq("type", "direct")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        for (const room of (rooms || []) as Array<{ id?: string | null }>) {
          const roomId = cleanId(room.id);
          if (!roomId) continue;
          const { data: members } = await supabase.from(NATIVE_CHAT_TABLES.members).select("user_id").eq("chat_id", roomId);
          const ids = (members || []).map((row: { user_id?: string | null }) => cleanId(row.user_id)).filter(Boolean);
          if (ids.length === 2 && ids.includes(actorId) && ids.includes(target)) return roomId;
        }
      }
    }
  } catch {
    // Best-effort parity fallback; throw normalized error below.
  }

  const { data: edgeData, error: edgeError } = await supabase.functions.invoke("ensure-direct-chat-room", {
    body: { targetUserId: target, targetName: targetLabel },
  });
  const edgeRoomId = cleanId((edgeData as { roomId?: unknown } | null)?.roomId);
  if (!edgeError && edgeRoomId) {
    await validateNativeDirectRoom(edgeRoomId, actorId, target);
    return edgeRoomId;
  }

  throw new Error(edgeError?.message || lastRpcError || "direct_chat_unavailable");
}

export async function fetchNativeChatRoom(roomId: string) {
  const id = cleanId(roomId);
  if (!id) throw new Error("missing_room");
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.rooms)
    .select("id,type,name,avatar_url,created_by,created_at,updated_at,last_message_at,visibility,join_method,room_code,location_label,location_country,pet_focus,description")
    .eq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRoom(data as Record<string, unknown>) : null;
}

export async function fetchNativeChatMembers(roomId: string) {
  const id = cleanId(roomId);
  if (!id) throw new Error("missing_room");
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.members)
    .select("chat_id,user_id,created_at,role")
    .eq("chat_id", id)
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapMember).filter((member) => member.userId);
}

export async function validateNativeDirectRoom(roomId: string, actorId: string, targetUserId: string) {
  const chatId = cleanId(roomId);
  const actor = cleanId(actorId);
  const target = cleanId(targetUserId);
  if (!chatId || !actor || !target) throw new Error("direct_room_invalid");
  await assertNativeDirectRelationshipAllowed(actor, target);
  const [room, members] = await Promise.all([
    fetchNativeChatRoom(chatId),
    fetchNativeChatMembers(chatId),
  ]);
  if (room?.type !== "direct") throw new Error("direct_room_type_mismatch");
  const memberIds = members.map((member) => member.userId).filter(Boolean);
  if (memberIds.length !== 2 || !memberIds.includes(actor) || !memberIds.includes(target)) {
    throw new Error("direct_room_member_mismatch");
  }
}

async function assertNativeDirectRelationshipAllowed(actorId: string, targetUserId: string) {
  const actor = cleanId(actorId);
  const target = cleanId(targetUserId);
  if (!actor || !target) throw new Error("direct_room_invalid");
  if (actor === target) throw new Error("cannot_chat_with_self");
  const [blocks, unmatches] = await Promise.all([
    supabase
      .from("user_blocks")
      .select("id")
      .or(`and(blocker_id.eq.${actor},blocked_id.eq.${target}),and(blocker_id.eq.${target},blocked_id.eq.${actor})`)
      .limit(1),
    supabase
      .from("user_unmatches")
      .select("id")
      .or(`and(actor_id.eq.${actor},target_id.eq.${target}),and(actor_id.eq.${target},target_id.eq.${actor})`)
      .limit(1),
  ]);
  if (blocks.error || unmatches.error) throw new Error("relationship_check_unavailable");
  if (Array.isArray(blocks.data) && blocks.data.length > 0) throw new Error("blocked_relationship");
  if (Array.isArray(unmatches.data) && unmatches.data.length > 0) throw new Error("unmatched_relationship");
}

export async function validateNativeGroupRoom(roomId: string) {
  const chatId = cleanId(roomId);
  if (!chatId) throw new Error("missing_group");
  const room = await fetchNativeChatRoom(chatId);
  if (room?.type !== "group") throw new Error("group_room_required");
  return room;
}

export async function fetchNativeChatMessages(options: {
  roomId: string;
  beforeCreatedAt?: string | null;
  limit?: number;
}) {
  const roomId = cleanId(options.roomId);
  if (!roomId) throw new Error("missing_room");
  let query = supabase
    .from(NATIVE_CHAT_TABLES.messages)
    .select("id,chat_id,sender_id,content,created_at")
    .eq("chat_id", roomId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.beforeCreatedAt) query = query.lt("created_at", options.beforeCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapMessage).reverse();
}

export async function updateNativeGroupChatMetadata(options: {
  roomId: string;
  name?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  locationLabel?: string | null;
  petFocus?: string[];
  updateName?: boolean;
  updateAvatar?: boolean;
  updateDescription?: boolean;
  updateLocation?: boolean;
  updatePetFocus?: boolean;
}) {
  const roomId = cleanId(options.roomId);
  if (!roomId) throw new Error("missing_room");
  const { data, error } = await nativeChatRpc("update_group_chat_metadata", {
    p_chat_id: roomId,
    p_name: options.name ?? null,
    p_avatar_url: options.avatarUrl ?? null,
    p_description: options.description ?? null,
    p_location_label: options.locationLabel ?? null,
    p_pet_focus: options.petFocus ?? null,
    p_update_name: options.updateName === true,
    p_update_avatar: options.updateAvatar === true,
    p_update_description: options.updateDescription === true,
    p_update_location: options.updateLocation === true,
    p_update_pet_focus: options.updatePetFocus === true,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return mapRoom(row as Record<string, unknown>);
}

export async function sendNativeChatMessage(options: {
  roomId: string;
  senderId: string;
  content: string;
}) {
  const roomId = cleanId(options.roomId);
  const senderId = cleanId(options.senderId);
  if (!roomId) throw new Error("missing_room");
  if (!senderId) throw new Error("missing_sender");
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.messages)
    .insert({ chat_id: roomId, sender_id: senderId, content: options.content })
    .select("id,chat_id,sender_id,content,created_at")
    .single();
  if (error) throw error;
  return mapMessage(data as Record<string, unknown>);
}

export async function markNativeChatMessagesRead(options: {
  roomId: string;
  userId: string;
  messageIds: string[];
}) {
  const roomId = cleanId(options.roomId);
  const userId = cleanId(options.userId);
  if (!roomId) throw new Error("missing_room");
  if (!userId) throw new Error("missing_user");
  const rows = Array.from(new Set(options.messageIds.map(cleanId).filter((id): id is string => Boolean(id))))
    .map((messageId) => ({ chat_id: roomId, message_id: messageId, user_id: userId, read_at: new Date().toISOString() }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.reads)
    .upsert(rows, { onConflict: "message_id,user_id" })
    .select("id,chat_id,message_id,user_id,read_at");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRead);
}

export async function markNativeChatRoomRead(options: { roomId: string; userId: string }) {
  const roomId = cleanId(options.roomId);
  const userId = cleanId(options.userId);
  if (!roomId) throw new Error("missing_room");
  if (!userId) throw new Error("missing_user");
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.messages)
    .select("id")
    .eq("chat_id", roomId)
    .neq("sender_id", userId)
    .limit(100);
  if (error) throw error;
  const messageIds = ((data ?? []) as Array<{ id?: string | null }>).map((row) => cleanId(row.id)).filter((id): id is string => Boolean(id));
  return markNativeChatMessagesRead({ roomId, userId, messageIds });
}

export async function fetchNativeReadReceipts(messageIds: string[], viewerUserId: string) {
  const cleanMessageIds = Array.from(new Set(messageIds.map(cleanId).filter((id): id is string => Boolean(id))));
  const viewer = cleanId(viewerUserId);
  if (cleanMessageIds.length === 0 || !viewer) return new Set<string>();
  const { data, error } = await supabase
    .from(NATIVE_CHAT_TABLES.reads)
    .select("message_id")
    .in("message_id", cleanMessageIds)
    .neq("user_id", viewer)
    .limit(Math.max(cleanMessageIds.length * 4, 20));
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ message_id?: string | null }>).map((row) => cleanId(row.message_id)).filter((id): id is string => Boolean(id)));
}

export async function markNativeChatRoomSeen(userId: string, roomId: string, seenAt?: string | null) {
  const viewer = cleanId(userId);
  const chatId = cleanId(roomId);
  if (!viewer || !chatId) return;
  const nextSeenAt = cleanString(seenAt) || new Date().toISOString();
  try {
    const key = getSeenStorageKey(viewer);
    const raw = await AsyncStorage.getItem(key);
    const seenByRoom = raw ? JSON.parse(raw) as Record<string, string> : {};
    const currentRaw = cleanString(seenByRoom[chatId]);
    const currentMs = currentRaw ? new Date(currentRaw).getTime() : Number.NaN;
    const nextMs = new Date(nextSeenAt).getTime();
    if (Number.isFinite(currentMs) && Number.isFinite(nextMs) && currentMs >= nextMs) return;
    await AsyncStorage.setItem(key, JSON.stringify({ ...seenByRoom, [chatId]: nextSeenAt }));
  } catch {
    // AsyncStorage seen state is an inbox hint; read receipts remain authoritative.
  }
}

const safeFileExtension = (fileName: string, fallback = "bin") => {
  const raw = fileName.includes(".") ? fileName.split(".").pop() : fallback;
  const ext = String(raw || fallback).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return ext || fallback;
};

export function createNativeChatAttachmentPath(options: {
  userId: string;
  roomId: string;
  fileName: string;
  nonce?: string;
}) {
  const userId = cleanId(options.userId);
  const roomId = cleanId(options.roomId);
  if (!userId) throw new Error("missing_user");
  if (!roomId) throw new Error("missing_room");
  const nonce = cleanString(options.nonce) ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/chat-media/${roomId}/${nonce}.${safeFileExtension(options.fileName)}`;
}

export async function uploadNativeChatAttachment(options: {
  userId: string;
  roomId: string;
  fileName: string;
  mime: string;
  body: ArrayBuffer | Uint8Array | Blob;
  size?: number | null;
}) {
  const path = createNativeChatAttachmentPath({
    userId: options.userId,
    roomId: options.roomId,
    fileName: options.fileName,
  });
  const { error } = await supabase.storage.from(NATIVE_CHAT_ATTACHMENTS_BUCKET).upload(path, options.body, {
    cacheControl: "3600",
    contentType: options.mime || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data, error: signedError } = await supabase.storage.from(NATIVE_CHAT_ATTACHMENTS_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signedError) throw signedError;
  return {
    bucket: NATIVE_CHAT_ATTACHMENTS_BUCKET,
    path,
    url: data.signedUrl,
    name: options.fileName || "attachment",
    mime: options.mime || "",
    size: options.size ?? null,
  } satisfies NativeChatAttachment;
}

export async function deleteOwnNativeChatAttachment(options: {
  userId: string;
  path: string;
}) {
  const userId = cleanId(options.userId);
  const path = cleanString(options.path);
  if (!userId) throw new Error("missing_user");
  if (!path) throw new Error("missing_attachment");
  if (!path.startsWith(`${userId}/`)) throw new Error("attachment_owner_mismatch");
  const { error } = await supabase.storage.from(NATIVE_CHAT_ATTACHMENTS_BUCKET).remove([path]);
  if (error) throw error;
}
