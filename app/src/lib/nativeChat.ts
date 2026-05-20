import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  normalizeNativeProfilePhotos,
  resolveNativeProfilePhotos,
} from "./nativeProfilePhotos";
import {
  normalizeNativeAvailabilityStatus,
} from "./nativePublicProfile";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult } from "./nativeStorageCleanup";
import { resolveNativeAvatarUrl, resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import type { NativeViewerScope } from "./nativeViewerScope";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

export const NATIVE_CHAT_TABLES = {
  rooms: "chats",
  members: "chat_room_members",
  messages: "chat_messages",
  reads: "message_reads",
} as const;

export const NATIVE_CHAT_ATTACHMENTS_BUCKET = "chat_attachments";
export const TEAM_HUDDLE_USER_ID = "8f55ab31-6b25-4d1a-98c7-3a6e8af2d941";
export const TEAM_HUDDLE_DISPLAY_NAME = "Team huddle";
export const TEAM_HUDDLE_AVAILABILITY = "Safety Team";
const NATIVE_CHAT_INBOX_CACHE_MS = 30_000;
const NATIVE_CHAT_UNREAD_CACHE_MS = 8000;
const NATIVE_CHAT_MESSAGE_CACHE_INDEX_MS = 30 * 24 * 60 * 60 * 1000;

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
  updatedAt: string | null;
  localStatus?: "pending" | "failed";
};

export type NativeChatRead = {
  id: string;
  chatId: string;
  messageId: string;
  userId: string;
  readAt: string | null;
};

export type NativeChatDialogueSnapshot = {
  room: NativeChatRoom | null;
  members: NativeChatMember[];
  messages: NativeChatMessage[];
  readMessageIds: Set<string>;
};

export type NativeChatAttachment = {
  bucket: typeof NATIVE_CHAT_ATTACHMENTS_BUCKET;
  path: string;
  url: string | null;
  name: string;
  mime: string;
  size: number | null;
};

export type NativeChatRouteParams = {
  room: string | null;
  withUserId: string | null;
  targetMessageId: string | null;
  name: string | null;
  joined: boolean;
  unread: number;
  returnTo: string | null;
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
  serviceProviderSkills?: string[];
  serviceRequestCard: Record<string, unknown> | null;
  shapeIssue: string | null;
  activityTs: string | null;
};

export type NativeMatchedRailSummary = {
  peerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  socialId: string | null;
  isVerified: boolean;
  chatId: string | null;
  matchedAt: string | null;
};

export type NativeChatDiscoverStatus = "ready" | "age_blocked" | "location_required" | "error";

export type NativeChatDiscoveryProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  hasCar: boolean;
  bio: string | null;
  relationshipStatus: string | null;
  age: number | null;
  locationName: string | null;
  locationCountry: string | null;
  gender: string | null;
  occupation: string | null;
  school: string | null;
  major: string | null;
  height: number | null;
  tier: string | null;
  pets: Array<{ name?: string | null; species?: string | null }>;
  petSpecies: string[];
  petSize: string | null;
  petExperience: string[];
  petExperienceYears: number | null;
  socialAlbum: string[];
  socialRoles: string[];
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

const nativeChatInboxCache = new Map<string, NativeValidatedCacheEnvelope<NativeChatInboxRow[]>>();
const nativeChatInboxInFlight = new Map<string, Promise<NativeChatInboxRow[]>>();
const nativeChatUnreadCache = new Map<string, { total: number; ts: number }>();
const nativeChatUnreadInFlight = new Map<string, Promise<number>>();
const nativeChatReadCacheGenerations = new Map<string, number>();

const NATIVE_CHAT_EXPLORE_CACHE_MS = 30_000;
const NATIVE_CHAT_GROUP_PREVIEW_CACHE_MS = 60_000;
const NATIVE_CHAT_DISCOVERY_CACHE_MS = 30_000;
const NATIVE_CHAT_DISCOVERY_RELATIONSHIP_CACHE_MS = 90_000;
const nativeExploreGroupsCache = new Map<string, { result: { invited: NativeExploreGroup[]; groups: NativeExploreGroup[] }; ts: number }>();
const nativeExploreGroupsInFlight = new Map<string, Promise<{ invited: NativeExploreGroup[]; groups: NativeExploreGroup[] }>>();

const nativeGroupPreviewMembersCache = new Map<string, { members: NativeGroupManagementSnapshot["members"]; ts: number }>();
const nativeGroupPreviewMembersInFlight = new Map<string, Promise<NativeGroupManagementSnapshot["members"]>>();

const nativeDiscoveryProfilesCache = new Map<string, { result: NativeChatDiscoveryResult; ts: number }>();
const nativeDiscoveryProfilesInFlight = new Map<string, Promise<NativeChatDiscoveryResult>>();

type NativeDiscoveryRelationshipGuard = {
  handledIds: Set<string>;
  restrictedIds: Set<string>;
  wavedAtViewerIds: Set<string>;
};

const emptyNativeDiscoveryRelationshipGuard = (): NativeDiscoveryRelationshipGuard => ({
  handledIds: new Set<string>(),
  restrictedIds: new Set<string>(),
  wavedAtViewerIds: new Set<string>(),
});

const nativeDiscoveryRelationshipCache = new Map<string, { result: NativeDiscoveryRelationshipGuard; ts: number }>();
const nativeDiscoveryRelationshipInFlight = new Map<string, Promise<NativeDiscoveryRelationshipGuard>>();

const nativeChatCacheSessionKey = (userId?: string | null, sessionKey?: string | null) => cleanString(sessionKey) || `${cleanId(userId) || "anon"}:0`;
const nativeChatReadCacheGenerationFor = (userId?: string | null) => nativeChatReadCacheGenerations.get(cleanId(userId) || "anon") ?? 0;
const nativeChatInboxPersistentKey = (key: string) => `chatInbox:v2:${key}`;
const nativeServiceTabDialoguesKey = (userId: string) => `native-chats:service-tab-dialogues:v1:${userId}`;
const nativeChatMessageIndexKey = (userId: string, sessionKey: string, chatId: string) => `chatMessages:v2:index:${userId}:${sessionKey}:${chatId}`;
const nativeChatMessageVersion = (message: Pick<NativeChatMessage, "createdAt" | "updatedAt">) => cleanString(message.updatedAt) || cleanString(message.createdAt);
const nativeChatMessageKey = (userId: string, sessionKey: string, chatId: string, message: Pick<NativeChatMessage, "id" | "createdAt" | "updatedAt">) =>
  `chatMessages:v2:${userId}:${sessionKey}:${chatId}:${message.id}:${nativeChatMessageVersion(message)}`;
const nativeChatMediaIndexKey = (userId: string, sessionKey: string, chatId: string) => `chatMedia:v2:index:${userId}:${sessionKey}:${chatId}`;
const nativeChatMediaVersion = (message: Pick<NativeChatMessage, "createdAt" | "updatedAt">) => cleanString(message.updatedAt) || cleanString(message.createdAt);
const nativeChatMediaKey = (userId: string, sessionKey: string, chatId: string, message: Pick<NativeChatMessage, "id" | "createdAt" | "updatedAt">) =>
  `chatMedia:v2:${userId}:${sessionKey}:${chatId}:${message.id}:${nativeChatMediaVersion(message)}`;

export type NativeValidatedCacheSource = "db" | "realtime";

export type NativeValidatedCacheEnvelope<T> = {
  userId: string;
  sessionKey: string;
  surface: string;
  cachedAt: number;
  dbConfirmedAt: number;
  source: NativeValidatedCacheSource;
  rows: T;
};

type NativeCachedChatMediaAttachment = {
  bucket: string | null;
  mime: string | null;
  path: string | null;
  url: string | null;
};

export const readNativeServiceTabHasDialogues = async (userId?: string | null) => {
  const viewer = cleanId(userId);
  if (!viewer) return false;
  try {
    const raw = await AsyncStorage.getItem(nativeServiceTabDialoguesKey(viewer));
    return raw === "1";
  } catch {
    return false;
  }
};

export const markNativeServiceTabHasDialogues = async (userId?: string | null) => {
  const viewer = cleanId(userId);
  if (!viewer) return;
  try {
    await AsyncStorage.setItem(nativeServiceTabDialoguesKey(viewer), "1");
  } catch {
    // Non-critical UI hint; DB inbox remains authoritative.
  }
};

type NativeCachedChatMediaEntry = {
  attachments: NativeCachedChatMediaAttachment[];
  createdAt: string;
  id: string;
  updatedAt: string | null;
};

const isNativeValidatedCacheEnvelope = <T,>(value: unknown, options: { sessionKey: string; surface: string; userId: string }): value is NativeValidatedCacheEnvelope<T> => {
  const row = value && typeof value === "object" ? value as Partial<NativeValidatedCacheEnvelope<T>> : null;
  return Boolean(
    row &&
    row.userId === options.userId &&
    row.sessionKey === options.sessionKey &&
    row.surface === options.surface &&
    typeof row.cachedAt === "number" &&
    typeof row.dbConfirmedAt === "number" &&
    (row.source === "db" || row.source === "realtime") &&
    row.rows !== undefined
  );
};

const readCachedNativeChatInboxRows = async (key: string, options: { sessionKey: string; surface: string; userId: string }): Promise<NativeChatInboxRow[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(nativeChatInboxPersistentKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isNativeValidatedCacheEnvelope<NativeChatInboxRow[]>(parsed, options) || Date.now() - parsed.cachedAt > NATIVE_CHAT_INBOX_CACHE_MS || !Array.isArray(parsed.rows)) {
      await AsyncStorage.removeItem(nativeChatInboxPersistentKey(key));
      return null;
    }
    return parsed.rows;
  } catch {
    await AsyncStorage.removeItem(nativeChatInboxPersistentKey(key)).catch(() => undefined);
    return null;
  }
};

const writeCachedNativeChatInboxRows = async (key: string, rows: NativeChatInboxRow[], options: { dbConfirmedAt: number; sessionKey: string; source: NativeValidatedCacheSource; surface: string; userId: string }) => {
  try {
    const envelope: NativeValidatedCacheEnvelope<NativeChatInboxRow[]> = {
      userId: options.userId,
      sessionKey: options.sessionKey,
      surface: options.surface,
      cachedAt: Date.now(),
      dbConfirmedAt: options.dbConfirmedAt,
      source: options.source,
      rows,
    };
    await AsyncStorage.setItem(nativeChatInboxPersistentKey(key), JSON.stringify(envelope));
  } catch {
    // Inbox cache is a short-lived shell optimization; network RPC remains authoritative.
  }
};

export const invalidateNativeChatReadCaches = async (userId?: string | null) => {
  const viewer = cleanId(userId);
  if (!viewer) return;
  nativeChatReadCacheGenerations.set(viewer, nativeChatReadCacheGenerationFor(viewer) + 1);
  for (const key of Array.from(nativeChatUnreadCache.keys())) {
    if (key.includes(viewer)) nativeChatUnreadCache.delete(key);
  }
  for (const key of Array.from(nativeChatUnreadInFlight.keys())) {
    if (key.includes(viewer)) nativeChatUnreadInFlight.delete(key);
  }
  for (const key of Array.from(nativeChatInboxCache.keys())) {
    if (key.includes(viewer)) nativeChatInboxCache.delete(key);
  }
  for (const key of Array.from(nativeChatInboxInFlight.keys())) {
    if (key.includes(viewer)) nativeChatInboxInFlight.delete(key);
  }
  await AsyncStorage.getAllKeys().then((keys) => {
    const staleKeys = keys.filter((key) => (
      (key.startsWith("chatInbox:v2:") || key.startsWith(`native-chats:inbox-cache:v2:${viewer}:`))
      && key.includes(viewer)
    ));
    return staleKeys.length ? AsyncStorage.multiRemove(staleKeys) : undefined;
  }).catch(() => undefined);
};

const extractCachedChatMediaAttachments = (content: string): NativeCachedChatMediaAttachment[] => {
  try {
    const parsed = JSON.parse(String(content || "{}")) as { attachments?: Array<{ bucket?: string | null; mime?: string | null; path?: string | null; url?: string | null }> };
    return (parsed.attachments || [])
      .filter((attachment) => Boolean(attachment))
      .map((attachment) => ({
        bucket: cleanString(attachment.bucket),
        mime: cleanString(attachment.mime),
        path: cleanString(attachment.path),
        url: cleanString(attachment.url),
      }))
      .filter((attachment) => attachment.bucket || attachment.path || attachment.url);
  } catch {
    return [];
  }
};

export async function readCachedNativeChatMessages(userId: string, chatId: string, options: { accessChecked?: boolean; sessionKey?: string | null } = {}): Promise<NativeChatMessage[]> {
  const cleanUserId = cleanId(userId);
  const cleanChatId = cleanId(chatId);
  if (options.accessChecked !== true) {
    if (__DEV__) console.log("NATIVE_CHAT_MESSAGE_CACHE_SKIP", { chatId: cleanChatId, reason: "access_not_checked" });
    return [];
  }
  if (!cleanUserId || !cleanChatId) return [];
  const cacheSessionKey = nativeChatCacheSessionKey(cleanUserId, options.sessionKey);
  const cacheSurface = `chat_messages:${cleanChatId}`;
  try {
    const rawIndex = await AsyncStorage.getItem(nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId));
    if (!rawIndex) {
      if (__DEV__) console.log("NATIVE_CHAT_MESSAGE_CACHE_MISS", { chatId: cleanChatId, reason: "cold" });
      return [];
    }
    const indexEnvelope = JSON.parse(rawIndex) as unknown;
    if (!isNativeValidatedCacheEnvelope<Array<{ id?: string; createdAt?: string; updatedAt?: string | null }>>(indexEnvelope, { sessionKey: cacheSessionKey, surface: cacheSurface, userId: cleanUserId }) || Date.now() - indexEnvelope.cachedAt > NATIVE_CHAT_MESSAGE_CACHE_INDEX_MS || !Array.isArray(indexEnvelope.rows)) {
      await AsyncStorage.removeItem(nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId));
      if (__DEV__) console.log("NATIVE_CHAT_MESSAGE_CACHE_MISS", { chatId: cleanChatId, reason: "stale_index" });
      return [];
    }
    const rows = await Promise.all(indexEnvelope.rows.map(async (entry) => {
      const id = cleanId(entry.id);
      const createdAt = cleanString(entry.createdAt);
      const updatedAt = cleanString(entry.updatedAt);
      if (!id || !createdAt) return null;
      const raw = await AsyncStorage.getItem(nativeChatMessageKey(cleanUserId, cacheSessionKey, cleanChatId, { id, createdAt, updatedAt }));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as NativeChatMessage;
      return parsed?.id === id && parsed.chatId === cleanChatId ? parsed : null;
    }));
    const result = rows.filter((row): row is NativeChatMessage => Boolean(row)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (__DEV__) console.log(result.length > 0 ? "NATIVE_CHAT_MESSAGE_CACHE_HIT" : "NATIVE_CHAT_MESSAGE_CACHE_MISS", { chatId: cleanChatId, count: result.length });
    return result;
  } catch {
    await AsyncStorage.removeItem(nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId)).catch(() => undefined);
    if (__DEV__) console.log("NATIVE_CHAT_MESSAGE_CACHE_MISS", { chatId: cleanChatId, reason: "corrupt" });
    return [];
  }
}

export async function writeCachedNativeChatMessages(userId: string, chatId: string, messages: NativeChatMessage[], options: { dbConfirmedAt?: number; sessionKey?: string | null; source?: NativeValidatedCacheSource } = {}) {
  const cleanUserId = cleanId(userId);
  const cleanChatId = cleanId(chatId);
  if (!cleanUserId || !cleanChatId || messages.length === 0) return;
  const cacheSessionKey = nativeChatCacheSessionKey(cleanUserId, options.sessionKey);
  const cacheSurface = `chat_messages:${cleanChatId}`;
  const dbConfirmedAt = options.dbConfirmedAt ?? Date.now();
  const source = options.source ?? "db";
  const safeMessages = messages.filter((message) => message.chatId === cleanChatId && cleanId(message.id) && cleanString(message.createdAt));
  if (safeMessages.length === 0) return;
  const indexMessages = safeMessages.map((message) => ({ id: message.id, createdAt: message.createdAt, updatedAt: nativeChatMessageVersion(message) }));
  const mediaEntries = safeMessages
    .map((message) => {
      const attachments = extractCachedChatMediaAttachments(message.content);
      if (attachments.length === 0) return null;
      return {
        attachments,
        createdAt: message.createdAt,
        id: message.id,
        updatedAt: nativeChatMediaVersion(message),
      } satisfies NativeCachedChatMediaEntry;
    })
    .filter((entry): entry is NativeCachedChatMediaEntry => Boolean(entry));
  await Promise.all(safeMessages.map((message) =>
    AsyncStorage.setItem(nativeChatMessageKey(cleanUserId, cacheSessionKey, cleanChatId, message), JSON.stringify(message)).catch(() => undefined)
  ));
  const indexEnvelope: NativeValidatedCacheEnvelope<typeof indexMessages> = {
    userId: cleanUserId,
    sessionKey: cacheSessionKey,
    surface: cacheSurface,
    cachedAt: Date.now(),
    dbConfirmedAt,
    source,
    rows: indexMessages,
  };
  await AsyncStorage.setItem(nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId), JSON.stringify(indexEnvelope)).catch(() => undefined);
  if (mediaEntries.length > 0) {
    const mediaIndex = mediaEntries.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt }));
    await Promise.all(mediaEntries.map((entry) =>
      AsyncStorage.setItem(nativeChatMediaKey(cleanUserId, cacheSessionKey, cleanChatId, entry), JSON.stringify(entry)).catch(() => undefined)
    ));
    await AsyncStorage.setItem(nativeChatMediaIndexKey(cleanUserId, cacheSessionKey, cleanChatId), JSON.stringify({ cachedAt: Date.now(), messages: mediaIndex })).catch(() => undefined);
  }
}

export async function clearCachedNativeChatMessages(userId: string, chatId: string, options: { sessionKey?: string | null } = {}) {
  const cleanUserId = cleanId(userId);
  const cleanChatId = cleanId(chatId);
  if (!cleanUserId || !cleanChatId) return;
  const cacheSessionKey = nativeChatCacheSessionKey(cleanUserId, options.sessionKey);
  const rawIndex = await AsyncStorage.getItem(nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId)).catch(() => null);
  const rawMediaIndex = await AsyncStorage.getItem(nativeChatMediaIndexKey(cleanUserId, cacheSessionKey, cleanChatId)).catch(() => null);
  const removals = [nativeChatMessageIndexKey(cleanUserId, cacheSessionKey, cleanChatId)];
  const mediaRemovals = [nativeChatMediaIndexKey(cleanUserId, cacheSessionKey, cleanChatId)];
  try {
    const index = rawIndex ? JSON.parse(rawIndex) as { messages?: Array<{ id?: string; createdAt?: string; updatedAt?: string | null }> } : null;
    if (Array.isArray(index?.messages)) {
      removals.push(...index.messages.map((entry) => {
        const id = cleanId(entry.id);
        const createdAt = cleanString(entry.createdAt);
        const updatedAt = cleanString(entry.updatedAt);
        return id && createdAt ? nativeChatMessageKey(cleanUserId, cacheSessionKey, cleanChatId, { id, createdAt, updatedAt }) : "";
      }).filter(Boolean));
    }
    const mediaIndex = rawMediaIndex ? JSON.parse(rawMediaIndex) as { messages?: Array<{ id?: string; createdAt?: string; updatedAt?: string | null }> } : null;
    if (Array.isArray(mediaIndex?.messages)) {
      mediaRemovals.push(...mediaIndex.messages.map((entry) => {
        const id = cleanId(entry.id);
        const createdAt = cleanString(entry.createdAt);
        const updatedAt = cleanString(entry.updatedAt);
        return id && createdAt ? nativeChatMediaKey(cleanUserId, cacheSessionKey, cleanChatId, { id, createdAt, updatedAt }) : "";
      }).filter(Boolean));
    }
  } catch {
    // Corrupt cache index is removed below.
  }
  await AsyncStorage.multiRemove([...removals, ...mediaRemovals]).catch(() => undefined);
}

export const clearNativeChatExploreCache = () => {
  nativeExploreGroupsCache.clear();
  nativeExploreGroupsInFlight.clear();
  nativeGroupPreviewMembersCache.clear();
  nativeGroupPreviewMembersInFlight.clear();
  nativeDiscoveryProfilesCache.clear();
  nativeDiscoveryProfilesInFlight.clear();
  nativeDiscoveryRelationshipCache.clear();
  nativeDiscoveryRelationshipInFlight.clear();
};

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
  distanceKm?: number | null;
};

export type NativeGroupManagementSnapshot = {
  members: Array<{ userId: string; name: string | null; avatarUrl: string | null; role: string | null; isVerified: boolean; isMuted?: boolean }>;
  joinRequests: Array<{ id: string; userId: string; name: string | null; avatarUrl: string | null; status: string | null; isVerified: boolean }>;
  pendingInvites: Array<{ id: string; userId: string; name: string | null; socialId: string | null; avatarUrl: string | null; status: string | null; isVerified: boolean }>;
  mediaUrls: string[];
};

export async function fetchNativeGroupPreviewMembers(chatId: string, options: { accessToken?: string | null } = {}): Promise<NativeGroupManagementSnapshot["members"]> {
  const roomId = cleanId(chatId);
  if (!roomId) return [];

  const now = Date.now();
  const cached = nativeGroupPreviewMembersCache.get(roomId);
  if (cached && now - cached.ts < NATIVE_CHAT_GROUP_PREVIEW_CACHE_MS) return cached.members;

  const existing = nativeGroupPreviewMembersInFlight.get(roomId);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await nativeChatRpc("get_public_group_preview_members", { p_chat_id: roomId }, options.accessToken);
    if (error) throw error;
    const members = await Promise.all((Array.isArray(data) ? data : []).map(async (value) => {
      const row = asRecord(value);
      return {
        userId: String(row.user_id || ""),
        name: cleanString(row.display_name),
        avatarUrl: await resolveNativeProfileImageUrlAsync(row.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => resolveNativeAvatarUrl(row.avatar_url)),
        role: cleanString(row.role) || "member",
        isVerified: verifiedValue(row),
      };
    }));
    const filteredMembers = members.filter((member) => member.userId);
    nativeGroupPreviewMembersCache.set(roomId, { members: filteredMembers, ts: Date.now() });
    return filteredMembers;
  })().finally(() => {
    if (nativeGroupPreviewMembersInFlight.get(roomId) === promise) nativeGroupPreviewMembersInFlight.delete(roomId);
  });

  nativeGroupPreviewMembersInFlight.set(roomId, promise);
  return promise;
}

type NativeChatRpc = (fn: string, params?: Record<string, unknown>, accessToken?: string | null) => Promise<{ data: unknown; error: { message?: string } | null }>;

const nativeChatRpc: NativeChatRpc = async (fn, params, accessToken) => {
  if (accessToken) {
    return nativeExactTokenRpc(fn, params ?? {}, accessToken);
  }
  return { data: null, error: { message: "missing_access_token" } };
};

const requireNativeChatAccessToken = (accessToken?: string | null) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("missing_access_token");
  return token;
};

const registerNativeChatMediaAsset = async (options: {
  accessToken?: string | null;
  bucket: string;
  contentId?: string | null;
  contentType?: string | null;
  expiresAt?: string | null;
  objectPath: string;
}) => {
  const bucket = cleanString(options.bucket);
  const objectPath = (cleanString(options.objectPath) || "").replace(/^\/+/, "");
  if (!bucket || !objectPath || objectPath.includes("..")) return;
  const { error } = await nativeChatRpc("register_native_media_asset", {
    p_bucket: bucket,
    p_content_id: options.contentId ?? null,
    p_content_type: options.contentType ?? null,
    p_expires_at: options.expiresAt ?? null,
    p_object_path: objectPath,
  }, options.accessToken);
  if (error) throw error;
};

const encodeStorageObjectPath = (bucket: string, path: string) =>
  `${encodeURIComponent(bucket)}/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;

export async function uploadNativeChatStorageObject(options: {
  accessToken?: string | null;
  bucket: string;
  path: string;
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string | null;
  upsert?: boolean;
}) {
  const token = requireNativeChatAccessToken(options.accessToken);
  const bucket = cleanString(options.bucket);
  const path = cleanString(options.path);
  if (!bucket || !path) throw new Error("missing_storage_object");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeStorageObjectPath(bucket, path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": options.contentType || "application/octet-stream",
      "x-upsert": options.upsert === true ? "true" : "false",
    },
    body: options.body as BodyInit,
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(raw || `storage_upload_failed_${response.status}`);
  }
}

export async function createNativeChatAttachmentSignedUrls(paths: string[], accessToken?: string | null) {
  const token = requireNativeChatAccessToken(accessToken);
  const uniquePaths = Array.from(new Set(paths.map(cleanString).filter((path): path is string => Boolean(path))));
  if (uniquePaths.length === 0) return {};
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(NATIVE_CHAT_ATTACHMENTS_BUCKET)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 30, paths: uniquePaths }),
  });
  if (!response.ok) throw new Error(`storage_sign_failed_${response.status}`);
  const rows = await response.json().catch(() => []) as Array<{ signedURL?: string; signedUrl?: string; path?: string }>;
  const byPath: Record<string, string | null> = {};
  rows.forEach((row, index) => {
    const signed = row.signedURL || row.signedUrl || null;
    byPath[row.path || uniquePaths[index]] = signed && signed.startsWith("/")
      ? `${supabaseUrl}/storage/v1${signed}`
      : signed;
  });
  return byPath;
}

export type NativeViewerGroupContext = {
  profile: Record<string, unknown> | null;
  pets: Array<{ species?: string | null; breed?: string | null }>;
  requestedChatIds: string[];
};

export async function fetchNativeViewerGroupContext(options: { accessToken?: string | null } = {}): Promise<NativeViewerGroupContext> {
  const { data, error } = await nativeChatRpc("get_native_viewer_group_context", undefined, options.accessToken);
  if (error) throw error;
  const row = asRecord(data);
  return {
    profile: asRecord(row.profile),
    pets: (Array.isArray(row.pets) ? row.pets : []).map((value) => {
      const pet = asRecord(value);
      return {
        species: cleanString(pet.species),
        breed: cleanString(pet.breed),
      };
    }),
    requestedChatIds: (Array.isArray(row.requested_chat_ids) ? row.requested_chat_ids : [])
      .map((value) => cleanId(value))
      .filter((id): id is string => Boolean(id)),
  };
}

const ALL_NATIVE_DISCOVERY_SPECIES = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others", "None"];
const ALL_NATIVE_DISCOVERY_ORIENTATIONS = ["Straight", "Gay / Lesbian", "Bisexual", "Pansexual", "Queer", "Asexual", "Questioning / Not sure", "Others"];
const ALL_NATIVE_DISCOVERY_DEGREES = ["High School", "Bachelor", "Master", "PhD", "Other"];
const ALL_NATIVE_DISCOVERY_LANGUAGES = [
  "English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian",
  "Arabic", "Hindi", "Bengali", "Urdu", "Russian", "Turkish", "Thai", "Vietnamese", "Indonesian", "Malay",
  "Tamil", "Telugu", "Polish", "Dutch", "Swedish",
];
const NATIVE_DISCOVERY_HEIGHT_MAX_CM = 250;

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
const verifiedValue = (row: Record<string, unknown>, boolKey = "is_verified", statusKey = "verification_status") => isNativeVerifiedProfile(row, boolKey, statusKey);
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
    targetMessageId: cleanId(params.get("targetMessage")) || cleanId(params.get("message_id")),
    name: cleanString(params.get("name")),
    joined: params.get("joined") === "1",
    unread: Math.max(0, Math.floor(Number(params.get("unread") || 0) || 0)),
    returnTo: cleanString(params.get("returnTo")),
  };
};

export async function resolveNativeChatInboxRowNavigation(
  row: NativeChatInboxRow,
  ensureDirectRoom: (targetUserId: string, targetName: string) => Promise<string> = ensureNativeDirectChatRoom,
) {
  const name = row.roomType === "group"
    ? row.chatName || "Group chat"
    : row.roomType === "service"
      ? row.peerName || row.chatName || "Care chat"
      : row.peerName || row.chatName || "Conversation";

  if (row.roomType === "service") {
    const avatarParam = row.peerAvatarUrl ? `&avatar=${encodeURIComponent(row.peerAvatarUrl)}` : "";
    const peerParam = row.peerUserId ? `&with=${encodeURIComponent(row.peerUserId)}` : "";
    const providerParam = row.serviceProviderId ? `&provider=${encodeURIComponent(row.serviceProviderId)}` : "";
    const skills = Array.isArray(row.serviceProviderSkills)
      ? row.serviceProviderSkills.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
      : [];
    const skillsParam = skills.length > 0 ? `&skills=${encodeURIComponent(skills.join("|"))}` : "";
    return `/service-chat?room=${encodeURIComponent(row.chatId)}&name=${encodeURIComponent(name)}&unread=${Math.max(0, row.unreadCount)}${avatarParam}${peerParam}${providerParam}${skillsParam}&returnTo=${encodeURIComponent("/chats?tab=service")}`;
  }

  if (row.roomType !== "group" && row.peerUserId) {
    const existingRoomId = cleanId(row.chatId);
    if (existingRoomId) {
      const avatarParam = row.peerAvatarUrl ? `&avatar=${encodeURIComponent(row.peerAvatarUrl)}` : "";
      return `/chat-dialogue?room=${encodeURIComponent(existingRoomId)}&name=${encodeURIComponent(name)}&with=${encodeURIComponent(row.peerUserId)}&unread=${Math.max(0, row.unreadCount)}${avatarParam}&returnTo=${encodeURIComponent("/chats?tab=friends")}`;
    }
    const roomId = await ensureDirectRoom(row.peerUserId, name);
    const avatarParam = row.peerAvatarUrl ? `&avatar=${encodeURIComponent(row.peerAvatarUrl)}` : "";
    return `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}&with=${encodeURIComponent(row.peerUserId)}&unread=${Math.max(0, row.unreadCount)}${avatarParam}&returnTo=${encodeURIComponent("/chats?tab=friends")}`;
  }

  return `/chat-dialogue?room=${encodeURIComponent(row.chatId)}&name=${encodeURIComponent(name)}&unread=${Math.max(0, row.unreadCount)}&returnTo=${encodeURIComponent("/chats?tab=groups")}`;
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
  updatedAt: cleanString(row.updated_at) || String(row.created_at || "") || null,
});

const mapRead = (row: Record<string, unknown>): NativeChatRead => ({
  id: String(row.id || ""),
  chatId: String(row.chat_id || ""),
  messageId: String(row.message_id || ""),
  userId: String(row.user_id || ""),
  readAt: cleanString(row.read_at),
});

const mapDialogueSnapshot = (value: unknown): NativeChatDialogueSnapshot => {
  const row = asRecord(value);
  const room = row.room && typeof row.room === "object" ? mapRoom(row.room as Record<string, unknown>) : null;
  const members = (Array.isArray(row.members) ? row.members : [])
    .map((member) => mapMember(asRecord(member)))
    .filter((member) => member.userId);
  const messages = (Array.isArray(row.messages) ? row.messages : [])
    .map((message) => mapMessage(asRecord(message)))
    .filter((message) => message.id);
  const readMessageIds = new Set(
    (Array.isArray(row.read_message_ids) ? row.read_message_ids : [])
      .map(cleanId)
      .filter((id): id is string => Boolean(id)),
  );
  return { room, members, messages, readMessageIds };
};

const resolveNativeInboxPeerAvatarUrl = async (value: unknown) => (
  await resolveNativeProfileImageUrlAsync(value, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => resolveNativeAvatarUrl(value))
);

const mapInboxRow = async (value: unknown): Promise<NativeChatInboxRow> => {
  const row = asRecord(value);
  return {
    chatId: String(row.chat_id || ""),
    roomType: String(row.room_type || ""),
    peerUserId: cleanId(row.peer_user_id),
    peerName: cleanString(row.peer_name),
    peerAvatarUrl: await resolveNativeInboxPeerAvatarUrl(row.peer_avatar_url),
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
    serviceProviderSkills: stringArray(row.service_provider_skills),
    serviceRequestCard: row.service_request_card && typeof row.service_request_card === "object" ? row.service_request_card as Record<string, unknown> : null,
    shapeIssue: cleanString(row.shape_issue),
    activityTs: cleanString(row.activity_ts),
  };
};

const isRenderableNativeInboxRow = (row: NativeChatInboxRow) => {
  if (!row.chatId) return false;
  if (row.roomType !== "direct") return true;
  if (row.memberCount !== 2) return false;
  if (!row.peerUserId) return false;
  if (row.shapeIssue) return false;
  return true;
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
  const socialRoles = normalizeNativeAvailabilityStatus(row)
    .map(normalizeSocialRole)
    .filter((role): role is string => Boolean(role));
  const avatarUrl = resolveNativeAvatarUrl(row.avatar_url);
  return {
    id: String(row.id || ""),
    displayName: cleanString(row.display_name) || "Huddle member",
    avatarUrl,
    coverUrl: avatarUrl,
    isVerified: verifiedValue(row),
    hasCar: booleanValue(row.has_car),
    bio: cleanString(row.bio),
    relationshipStatus: cleanString(row.relationship_status),
    age: firstFiniteNumber(row.age_years),
    locationName: cleanString(row.location_name),
    locationCountry: cleanString(row.location_country),
    gender: cleanString(row.gender_genre),
    occupation: cleanString(row.occupation),
    school: cleanString(row.school),
    major: cleanString(row.major),
    height: firstFiniteNumber(row.height),
    tier: cleanString(row.effective_tier) || cleanString(row.tier),
    pets,
    petSpecies: stringArray(row.pet_species),
    petSize: cleanString(row.pet_size),
    petExperience: stringArray(row.pet_experience),
    petExperienceYears: firstFiniteNumber(row.pet_experience_years, row.experience_years),
    socialAlbum: [],
    socialRoles,
    socialRole: socialRoles[0] ?? null,
    lastActiveAt: cleanString(row.last_active_at),
    updatedAt: cleanString(row.updated_at),
    createdAt: cleanString(row.created_at),
    score: numberValue(row.score),
  };
};

const hydrateDiscoveryProfileFromProfileViewSource = async (
  row: Record<string, unknown>,
): Promise<NativeChatDiscoveryProfile> => {
  const profile = mapDiscoveryProfile(row);
  const photos = normalizeNativeProfilePhotos(row.photos, {
    avatarUrl: cleanString(row.avatar_url),
  });
  const resolvedPhotoUrls = await resolveNativeProfilePhotos(photos);
  const profilePhotoAlbum = [
    resolvedPhotoUrls.cover,
    resolvedPhotoUrls.establishing,
    resolvedPhotoUrls.pack,
    resolvedPhotoUrls.solo,
    resolvedPhotoUrls.closer,
  ].filter((url): url is string => Boolean(url));
  const orderedAlbum = profilePhotoAlbum.length > 0 ? profilePhotoAlbum : [
    profile.avatarUrl,
  ].filter((url): url is string => Boolean(url));
  const uniqueAlbum = Array.from(new Set(orderedAlbum));

  return {
    ...profile,
    avatarUrl: uniqueAlbum[0] ?? profile.avatarUrl,
    coverUrl: resolvedPhotoUrls.cover ?? uniqueAlbum[0] ?? profile.coverUrl,
    socialAlbum: uniqueAlbum,
  };
};

export async function fetchNativeChatInbox(options: {
  userId?: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  scope: NativeChatInboxScope;
  chatIds?: string[];
  onlyWithActivity?: boolean | null;
  limit?: number;
  cursor?: string | null;
  force?: boolean;
  forceDb?: boolean;
  allowCacheHydration?: boolean;
  onCacheHydration?: (rows: NativeChatInboxRow[]) => void;
  cacheWriteGuard?: () => boolean;
}) {
	  const key = JSON.stringify({
    chatIds: options.chatIds && options.chatIds.length > 0 ? [...options.chatIds].sort() : null,
    cursor: options.cursor ?? null,
    limit: options.limit ?? null,
    onlyWithActivity: options.onlyWithActivity ?? null,
    scope: options.scope,
    sessionKey: nativeChatCacheSessionKey(options.userId, options.sessionKey),
    userId: cleanId(options.userId) || "anon",
  });
	  const now = Date.now();
  const readCacheGeneration = nativeChatReadCacheGenerationFor(options.userId);
  const cacheSessionKey = nativeChatCacheSessionKey(options.userId, options.sessionKey);
  const cacheUserId = cleanId(options.userId) || "anon";
  const cacheSurface = `chat_inbox:${options.scope}`;
  const cached = nativeChatInboxCache.get(key);
  const canHydrateFromCache = options.allowCacheHydration === true && !options.forceDb;
  if (canHydrateFromCache && cached && now - cached.cachedAt < NATIVE_CHAT_INBOX_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_CHAT_INBOX_CACHE_HYDRATE", { key, count: cached.rows.length });
    options.onCacheHydration?.(cached.rows);
  }
  if (canHydrateFromCache && !cached) {
    const persistent = await readCachedNativeChatInboxRows(key, { sessionKey: cacheSessionKey, surface: cacheSurface, userId: cacheUserId });
    if (persistent) {
      nativeChatInboxCache.set(key, {
        userId: cacheUserId,
        sessionKey: cacheSessionKey,
        surface: cacheSurface,
        cachedAt: now,
        dbConfirmedAt: now,
        source: "db",
        rows: persistent,
      });
      if (__DEV__) console.log("NATIVE_CHAT_INBOX_ASYNC_CACHE_HYDRATE", { key, count: persistent.length });
      options.onCacheHydration?.(persistent);
    }
  }
  if (__DEV__) console.log("NATIVE_CHAT_INBOX_DB_REFRESH", { key, force: options.force === true, forceDb: options.forceDb === true });
  const inFlight = nativeChatInboxInFlight.get(key);
  if (!options.force && !options.forceDb && inFlight) return inFlight;
  const promise = (async () => {
    const { data, error } = await nativeChatRpc("get_chat_inbox_summaries", {
      p_scope: options.scope,
      p_chat_ids: options.chatIds && options.chatIds.length > 0 ? options.chatIds : null,
      p_only_with_activity: options.onlyWithActivity ?? null,
      p_limit: options.limit ?? null,
      p_cursor: options.cursor ?? null,
    }, options.accessToken);
    if (error) throw error;
    const rows = (await Promise.all((Array.isArray(data) ? data : []).map(mapInboxRow))).filter(isRenderableNativeInboxRow);
	    if (nativeChatReadCacheGenerationFor(options.userId) === readCacheGeneration && options.cacheWriteGuard?.() !== false) {
      const dbConfirmedAt = Date.now();
	      nativeChatInboxCache.set(key, {
        userId: cacheUserId,
        sessionKey: cacheSessionKey,
        surface: cacheSurface,
        cachedAt: dbConfirmedAt,
        dbConfirmedAt,
        source: "db",
        rows,
      });
	      void writeCachedNativeChatInboxRows(key, rows, { dbConfirmedAt, sessionKey: cacheSessionKey, source: "db", surface: cacheSurface, userId: cacheUserId });
    }
    return rows;
  })().finally(() => {
    if (nativeChatInboxInFlight.get(key) === promise) nativeChatInboxInFlight.delete(key);
  });
  nativeChatInboxInFlight.set(key, promise);
  return promise;
}

export async function searchNativeChatInbox(query: string, options: { userId?: string | null; accessToken?: string | null; sessionKey?: string | null } = {}) {
  const { data, error } = await nativeChatRpc("search_chat_inbox", { p_query: query.trim() }, options.accessToken);
  if (error && isRpcSignatureDrift(error)) {
    const rows = await fetchNativeChatInbox({ userId: options.userId, accessToken: options.accessToken, sessionKey: options.sessionKey, scope: "all", onlyWithActivity: false, limit: 80, force: true, forceDb: true });
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
  return (await Promise.all((Array.isArray(data) ? data : []).map(mapInboxRow))).filter((row) => row.chatId);
}

export async function fetchNativeMatchedRailSummary(options: { accessToken?: string | null; limit?: number } = {}): Promise<NativeMatchedRailSummary[]> {
  const { data, error } = await nativeChatRpc("get_native_matched_rail_summary", {
    p_limit: Math.max(1, Math.min(options.limit ?? 500, 500)),
  }, options.accessToken);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((value) => {
    const row = asRecord(value);
    return {
      peerUserId: cleanId(row.peer_user_id) || "",
      displayName: cleanString(row.display_name),
      avatarUrl: resolveNativeAvatarUrl(row.avatar_url),
      socialId: cleanString(row.social_id)?.replace(/^@/, "") || null,
      isVerified: verifiedValue(row),
      chatId: cleanId(row.chat_id),
      matchedAt: cleanString(row.matched_at),
    };
  }).filter((row) => row.peerUserId);
}

export async function fetchNativeChatUnreadTotal(userId?: string | null, options: { accessToken?: string | null; sessionKey?: string | null; force?: boolean; cacheWriteGuard?: () => boolean } = {}) {
	  const cacheKey = `${cleanId(userId) || "anon"}:${nativeChatCacheSessionKey(userId, options.sessionKey)}`;
	  const now = Date.now();
  const readCacheGeneration = nativeChatReadCacheGenerationFor(userId);
	  const cached = nativeChatUnreadCache.get(cacheKey);
  if (!options.force && cached && now - cached.ts < NATIVE_CHAT_UNREAD_CACHE_MS) return cached.total;
  const inFlight = nativeChatUnreadInFlight.get(cacheKey);
  if (!options.force && inFlight) return inFlight;
  const promise = (async () => {
    const { data, error } = await nativeChatRpc("get_chat_inbox_unread_total", {}, options.accessToken);
    if (error && isRpcSignatureDrift(error)) {
      const rows = await fetchNativeChatInbox({ userId, accessToken: options.accessToken, sessionKey: options.sessionKey, scope: "all", onlyWithActivity: true, limit: 80, force: true, forceDb: true });
      const total = rows.reduce((sum, row) => sum + row.unreadCount, 0);
	      if (nativeChatReadCacheGenerationFor(userId) === readCacheGeneration && options.cacheWriteGuard?.() !== false) nativeChatUnreadCache.set(cacheKey, { total, ts: Date.now() });
	      return total;
    }
    if (error) throw error;
    const total = numberValue(data);
	    if (nativeChatReadCacheGenerationFor(userId) === readCacheGeneration && options.cacheWriteGuard?.() !== false) nativeChatUnreadCache.set(cacheKey, { total, ts: Date.now() });
    return total;
  })().finally(() => {
    if (nativeChatUnreadInFlight.get(cacheKey) === promise) nativeChatUnreadInFlight.delete(cacheKey);
  });
  nativeChatUnreadInFlight.set(cacheKey, promise);
  return promise;
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

export async function fetchNativeExploreGroups(options: { userId: string; accessToken?: string | null; joinedGroupIds?: string[]; force?: boolean; cacheWriteGuard?: () => boolean; viewerScope?: NativeViewerScope | null }) {
  const userId = cleanId(options.userId);
  if (!userId) return { invited: [] as NativeExploreGroup[], groups: [] as NativeExploreGroup[] };
  const joinedIds = new Set((options.joinedGroupIds ?? []).map(cleanId).filter((id): id is string => Boolean(id)));
  const cacheKey = JSON.stringify({
    userId,
    joinedGroupIds: Array.from(joinedIds).sort(),
    scope: {
      country: options.viewerScope?.country ?? null,
      district: options.viewerScope?.district ?? null,
      source: options.viewerScope?.source ?? null,
    },
  });
  const now = Date.now();
  const cached = nativeExploreGroupsCache.get(cacheKey);
  if (!options.force && cached && now - cached.ts < NATIVE_CHAT_EXPLORE_CACHE_MS) return cached.result;

  const existing = nativeExploreGroupsInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    if (!options.accessToken) throw new Error("missing_access_token");
  const [viewerContext, invitePreviewResult, publicGroupsResult] = await Promise.all([
    fetchNativeViewerGroupContext({ accessToken: options.accessToken }),
    nativeChatRpc("get_group_invite_previews", { p_user_id: userId }, options.accessToken),
    nativeChatRpc("get_public_groups_for_viewer", { p_country: options.viewerScope?.country ?? null }, options.accessToken),
  ]);
  if (invitePreviewResult.error) throw invitePreviewResult.error;
  if (publicGroupsResult.error) throw publicGroupsResult.error;
  const requestedIds = new Set(viewerContext.requestedChatIds);
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
  const viewer = asRecord(viewerContext.profile);
  const viewerDistrict = options.viewerScope
    ? options.viewerScope.district || options.viewerScope.country
    : cleanString(viewer.location_district) || cleanString(viewer.location_name);
  const userSpecies = viewerContext.pets
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
  const result = { invited, groups };
    if (options.cacheWriteGuard?.() !== false) nativeExploreGroupsCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  })().finally(() => {
    if (nativeExploreGroupsInFlight.get(cacheKey) === request) nativeExploreGroupsInFlight.delete(cacheKey);
  });

  nativeExploreGroupsInFlight.set(cacheKey, request);
  return request;
}

export async function fetchNativePendingGroupInvitePrompts(userId: string, options: { accessToken?: string | null } = {}) {
  const inviteeUserId = cleanId(userId);
  if (!inviteeUserId) return [] as NativeExploreGroup[];
  if (!options.accessToken) throw new Error("missing_access_token");
  const { data, error } = await nativeChatRpc("get_group_invite_previews", { p_user_id: inviteeUserId }, options.accessToken);
  if (error) throw error;
  return (((data || []) as unknown) as Record<string, unknown>[])
    .map((row) => {
      const inviterName = cleanString(row.inviter_name);
      return mapExploreGroup({
        id: row.chat_id,
        chat_id: row.chat_id,
        chat_name: row.chat_name,
        created_at: row.created_at,
        avatar_url: row.avatar_url,
        member_count: row.member_count,
        pet_focus: row.pet_focus,
        location_label: row.location_label,
        location_country: row.location_country,
        location_district: row.location_district,
        join_method: row.join_method,
        description: row.description,
        created_by: row.created_by,
        last_message_at: row.last_message_at,
        visibility: row.visibility,
        room_code: row.room_code,
        invite_pending: true,
        inviter_name: inviterName,
      }, { invite: { invite_id: row.invite_id, inviter_name: inviterName }, requested: false });
    })
    .filter((group) => group.id && group.inviteId);
}

export async function acceptNativeGroupInvite(options: { inviteId?: string | null; chatId: string; accessToken?: string | null }) {
  const inviteId = cleanId(options.inviteId);
  let chatId = cleanId(options.chatId);
  if (!chatId && inviteId) {
    const { data, error } = await nativeChatRpc("get_native_group_invite_chat_id", { p_invite_id: inviteId }, options.accessToken);
    if (error) throw error;
    chatId = cleanId(asRecord(data).chat_id);
  }
  if (!chatId) throw new Error("missing_group_invite");
  const { data, error } = inviteId
    ? await nativeChatRpc("accept_group_chat_invite_by_id", { p_invite_id: inviteId }, options.accessToken)
    : await nativeChatRpc("accept_group_chat_invite", { p_chat_id: chatId }, options.accessToken);
  if (error) throw error;
  let joined = Array.isArray(data) ? booleanValue(asRecord(data[0]).joined) : false;
  // Fallback: if the invite-by-id lookup returned false (e.g. invite already consumed or status changed),
  // retry via the chat-id path which accepts any pending invite for this user in this room.
  if (!joined && inviteId && chatId) {
    const fallback = await nativeChatRpc("accept_group_chat_invite", { p_chat_id: chatId }, options.accessToken);
    if (!fallback.error) {
      joined = Array.isArray(fallback.data) ? booleanValue(asRecord((fallback.data as unknown[])[0]).joined) : false;
    }
  }
  if (!joined) throw new Error("group_invite_unavailable");
}

export async function declineNativeGroupInvite(options: { inviteId?: string | null; chatId: string; userId: string; accessToken?: string | null }) {
  const inviteId = cleanId(options.inviteId);
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!userId || (!inviteId && !chatId)) throw new Error("missing_group_invite");
  const { error } = await nativeChatRpc("decline_native_group_invite", {
    p_invite_id: inviteId,
    p_chat_id: chatId,
  }, options.accessToken);
  if (error) throw error;
}

export async function requestNativeGroupJoin(options: { userId: string; chatId: string; accessToken?: string | null }) {
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!chatId || !userId) throw new Error("missing_group_join");
  const { error } = await nativeChatRpc("request_native_group_join", { p_chat_id: chatId }, options.accessToken);
  if (error) throw error;
}

export async function joinNativePublicGroup(options: { userId: string; chatId: string; accessToken?: string | null }) {
  const userId = cleanId(options.userId);
  const chatId = cleanId(options.chatId);
  if (!userId || !chatId) throw new Error("missing_group_join");
  const { error } = await nativeChatRpc("join_native_group_member", { p_chat_id: chatId, p_user_id: userId, p_role: "member" }, options.accessToken);
  if (error) throw error;
  void nativeChatRpc("post_group_welcome_message", { p_chat_id: chatId, p_user_id: userId }, options.accessToken);
}

export async function joinNativeGroupByCode(options: { userId: string; code: string; accessToken?: string | null }) {
  const code = String(options.code || "").trim().replace(/\s+/g, "").toUpperCase();
  if (!code) throw new Error("missing_group_code");
  const { data, error } = await nativeChatRpc("join_private_group_by_code", { p_code: code }, options.accessToken);
  if (error) throw error;
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  const joined = booleanValue(row.joined);
  const chatId = cleanId(row.chat_id);
  if (!joined || !chatId) throw new Error(cleanString(row.reason) || "group_code_not_found");
  await validateNativeGroupRoom(chatId, { accessToken: options.accessToken });
  void nativeChatRpc("post_group_welcome_message", { p_chat_id: chatId, p_user_id: options.userId }, options.accessToken);
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
  accessToken?: string | null;
}) {
  const userId = cleanId(options.userId);
  const name = cleanString(options.name);
  if (!userId) throw new Error("missing_user");
  if (!name) throw new Error("missing_group_name");
  const { data, error } = await nativeChatRpc("create_native_group_chat", {
    p_name: name,
    p_description: cleanString(options.description),
    p_join_method: options.joinMethod,
    p_visibility: options.visibility,
    p_avatar_url: cleanString(options.avatarUrl),
    p_location_label: cleanString(options.locationLabel),
    p_location_country: cleanString(options.locationCountry),
    p_pet_focus: options.petFocus && options.petFocus.length > 0 ? options.petFocus : null,
    p_invite_user_ids: options.inviteUserIds ?? [],
  }, options.accessToken);
  if (error) throw error;
  const row = asRecord(Array.isArray(data) ? data[0] : data);
  const chatId = cleanId(row.id);
  if (!chatId) throw new Error("group_not_created");
  return { chatId, name };
}

export async function fetchNativeGroupManagementSnapshot(chatId: string, options: { accessToken?: string | null } = {}): Promise<NativeGroupManagementSnapshot> {
  const roomId = cleanId(chatId);
  if (!roomId) return { members: [], joinRequests: [], pendingInvites: [], mediaUrls: [] };
  const { data, error } = await nativeChatRpc("get_native_group_management_snapshot", { p_chat_id: roomId }, options.accessToken);
  if (error) throw error;
  const snapshot = asRecord(data);
  const mediaPaths = (Array.isArray(snapshot.media_paths) ? snapshot.media_paths : [])
    .map((path) => cleanString(path))
    .filter((path): path is string => Boolean(path));
  const signedByPath = mediaPaths.length > 0 ? await createNativeChatAttachmentSignedUrls(mediaPaths, options.accessToken) : {};
  const members = await Promise.all(((Array.isArray(snapshot.members) ? snapshot.members : []) as Record<string, unknown>[]).map(async (row) => {
    return { userId: String(row.user_id || ""), role: cleanString(row.role), name: cleanString(row.display_name), avatarUrl: await resolveNativeProfileImageUrlAsync(row.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => resolveNativeAvatarUrl(row.avatar_url)), isVerified: verifiedValue(row), isMuted: row.is_muted === true };
  }));
  const joinRequests = await Promise.all(((Array.isArray(snapshot.join_requests) ? snapshot.join_requests : []) as Record<string, unknown>[]).map(async (row) => {
    return { id: String(row.id || ""), userId: String(row.user_id || ""), status: cleanString(row.status), name: cleanString(row.display_name), avatarUrl: await resolveNativeProfileImageUrlAsync(row.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => resolveNativeAvatarUrl(row.avatar_url)), isVerified: verifiedValue(row) };
  }));
  const pendingInvites = await Promise.all(((Array.isArray(snapshot.pending_invites) ? snapshot.pending_invites : []) as Record<string, unknown>[]).map(async (row) => {
    return { id: String(row.id || ""), userId: String(row.invitee_user_id || ""), status: cleanString(row.status), name: cleanString(row.display_name), socialId: cleanString(row.social_id)?.replace(/^@/, "") || null, avatarUrl: await resolveNativeProfileImageUrlAsync(row.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => resolveNativeAvatarUrl(row.avatar_url)), isVerified: verifiedValue(row) };
  }));
  return {
    members: members.filter((row) => row.userId),
    joinRequests: joinRequests.filter((row) => row.id && row.userId),
    pendingInvites: pendingInvites.filter((row) => row.id && row.userId),
    mediaUrls: [
      ...(Array.isArray(snapshot.media_urls) ? snapshot.media_urls : []).map((url) => cleanString(url)).filter((url): url is string => Boolean(url)),
      ...mediaPaths.map((path) => signedByPath[path]).filter((url): url is string => Boolean(url)),
    ].slice(0, 12),
  };
}

export async function updateNativeGroupJoinRequest(options: { chatId: string; requestId: string; userId: string; action: "approve" | "decline"; accessToken?: string | null }) {
  const requestId = cleanId(options.requestId);
  if (!requestId) throw new Error("missing_group_request");
  const { error } = await nativeChatRpc(options.action === "approve" ? "approve_group_join_request" : "decline_group_join_request", { p_request_id: requestId }, options.accessToken);
  if (error) throw error;
}

export async function removeNativeGroupMember(options: { chatId: string; userId: string; accessToken?: string | null }) {
  const chatId = cleanId(options.chatId);
  const userId = cleanId(options.userId);
  if (!chatId || !userId) throw new Error("missing_group_member");
  const { error } = await nativeChatRpc("remove_native_group_member", { p_chat_id: chatId, p_user_id: userId }, options.accessToken);
  if (error) throw error;
}

export async function removeNativeGroupChat(chatId: string, options: { accessToken?: string | null } = {}) {
  const roomId = cleanId(chatId);
  if (!roomId) throw new Error("missing_group");
  const { error } = await nativeChatRpc("remove_group_chat", { p_chat_id: roomId }, options.accessToken);
  if (error) throw error;
}

export async function setNativeGroupMuteState(options: { chatId: string; muted: boolean; accessToken?: string | null }) {
  const chatId = cleanId(options.chatId);
  if (!chatId) throw new Error("missing_group");
  const { error } = await nativeChatRpc("set_group_mute_state", { p_chat_id: chatId, p_muted: options.muted }, options.accessToken);
  if (error) throw error;
}

export async function inviteNativeGroupMembers(options: { chatId: string; chatName: string; inviterUserId: string; inviteUserIds: string[]; accessToken?: string | null }) {
  const chatId = cleanId(options.chatId);
  const inviterUserId = cleanId(options.inviterUserId);
  if (!chatId || !inviterUserId) throw new Error("missing_group_invite");
  const inviteUserIds = Array.from(new Set(options.inviteUserIds.map(cleanId).filter((id): id is string => Boolean(id) && id !== inviterUserId)));
  if (inviteUserIds.length === 0) return;
  const { error } = await nativeChatRpc("invite_native_group_members", {
    p_chat_id: chatId,
    p_chat_name: cleanString(options.chatName) || "Group",
    p_invitee_user_ids: inviteUserIds,
  }, options.accessToken);
  if (error) throw error;
}

export async function cancelNativeGroupInvite(options: { chatId: string; inviteId: string; accessToken?: string | null }) {
  const chatId = cleanId(options.chatId);
  const inviteId = cleanId(options.inviteId);
  if (!chatId || !inviteId) throw new Error("missing_group_invite");
  const { error } = await nativeChatRpc("cancel_native_group_invite", {
    p_chat_id: chatId,
    p_invite_id: inviteId,
  }, options.accessToken);
  if (error) throw error;
}

export function markNativeDiscoveryRelationshipHandled(viewerId: string, targetUserId: string) {
  const cleanViewerId = cleanId(viewerId);
  const cleanTargetId = cleanId(targetUserId);
  if (!cleanViewerId || !cleanTargetId) return;
  nativeDiscoveryProfilesCache.clear();
  nativeDiscoveryProfilesInFlight.clear();
  const cached = nativeDiscoveryRelationshipCache.get(cleanViewerId);
  if (!cached) {
    nativeDiscoveryRelationshipCache.set(cleanViewerId, {
      result: {
        handledIds: new Set([cleanTargetId]),
        restrictedIds: new Set<string>(),
        wavedAtViewerIds: new Set<string>(),
      },
      ts: Date.now(),
    });
    return;
  }
  cached.result.handledIds.add(cleanTargetId);
  cached.ts = Date.now();
}

export function invalidateNativeDiscoveryRelationshipCache(viewerId?: string | null) {
  const cleanViewerId = cleanId(viewerId);
  nativeDiscoveryProfilesCache.clear();
  nativeDiscoveryProfilesInFlight.clear();
  if (cleanViewerId) {
    nativeDiscoveryRelationshipCache.delete(cleanViewerId);
    nativeDiscoveryRelationshipInFlight.delete(cleanViewerId);
    return;
  }
  nativeDiscoveryRelationshipCache.clear();
  nativeDiscoveryRelationshipInFlight.clear();
}

async function fetchNativeDiscoveryRelationshipGuard(viewerId: string, options: { force?: boolean } = {}): Promise<NativeDiscoveryRelationshipGuard> {
  const cleanViewerId = cleanId(viewerId);
  if (!cleanViewerId) return emptyNativeDiscoveryRelationshipGuard();

  const cached = nativeDiscoveryRelationshipCache.get(cleanViewerId);
  if (!options.force && cached && Date.now() - cached.ts < NATIVE_CHAT_DISCOVERY_RELATIONSHIP_CACHE_MS) return cached.result;
  const result = emptyNativeDiscoveryRelationshipGuard();
  nativeDiscoveryRelationshipCache.set(cleanViewerId, { result, ts: Date.now() });
  return result;
}

export async function fetchNativeChatDiscoveryProfiles(
  userId: string,
  filters?: Partial<NativeChatDiscoveryFilters>,
  options?: { accessToken?: string | null; effectiveTier?: string | null; force?: boolean; cacheWriteGuard?: () => boolean; viewerScope?: NativeViewerScope | null },
): Promise<NativeChatDiscoveryResult> {
  const viewerId = cleanId(userId);
  if (!viewerId) return { status: "location_required" as const, locationLabel: null, anchor: null, profiles: [] };
  const scopePoint = options?.viewerScope?.primaryPoint ?? null;
  const lat = firstFiniteNumber(scopePoint?.lat);
  const lng = firstFiniteNumber(scopePoint?.lng);
  if (lat === null || lng === null) return { status: "location_required" as const, locationLabel: null, anchor: null, profiles: [] };
  const requestKey = JSON.stringify({
    viewerId,
    filters: filters ?? {},
    effectiveTier: options?.effectiveTier ?? null,
    scope: {
      anchor: lat !== null && lng !== null ? { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) } : "server",
      country: options?.viewerScope?.country ?? null,
      district: options?.viewerScope?.district ?? null,
      source: options?.viewerScope?.source ?? null,
    },
  });
  const existing = nativeDiscoveryProfilesInFlight.get(requestKey);
  if (existing) return existing;

  const request: Promise<NativeChatDiscoveryResult> = (async () => {
    const cacheKey = JSON.stringify({
      viewerId,
      filters: filters ?? {},
      effectiveTier: options?.effectiveTier ?? null,
      locationAnchor: lat !== null && lng !== null ? { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) } : "server",
      viewerCountry: options?.viewerScope?.country ?? null,
      viewerDistrict: options?.viewerScope?.district ?? null,
      viewerScopeSource: options?.viewerScope?.source ?? null,
    });
    const cached = nativeDiscoveryProfilesCache.get(cacheKey);
    if (!options?.force && cached && Date.now() - cached.ts < NATIVE_CHAT_DISCOVERY_CACHE_MS) return cached.result;
    if (!options?.accessToken) throw new Error("missing_access_token");

    const selectedSpecies = filters?.species ?? [];
    const speciesFilter = selectedSpecies.length === 0 || selectedSpecies.length === ALL_NATIVE_DISCOVERY_SPECIES.length ? null : selectedSpecies;
    const selectedDegrees = filters?.degrees ?? [];
    const degreeFilter = selectedDegrees.length === 0 || selectedDegrees.length === ALL_NATIVE_DISCOVERY_DEGREES.length ? null : selectedDegrees;
    const selectedLanguages = filters?.languages ?? [];
    const languageFilter = selectedLanguages.length === 0 || selectedLanguages.length === ALL_NATIVE_DISCOVERY_LANGUAGES.length ? null : selectedLanguages;
    const selectedOrientations = filters?.orientations ?? [];
    const orientationFilter = selectedOrientations.length === 0 || selectedOrientations.length === ALL_NATIVE_DISCOVERY_ORIENTATIONS.length ? null : selectedOrientations;
    const hasExplicitHeightFilter = ((filters?.heightMin ?? 100) > 100 || (filters?.heightMax ?? NATIVE_DISCOVERY_HEIGHT_MAX_CM) < NATIVE_DISCOVERY_HEIGHT_MAX_CM);
    const { data, error } = await nativeChatRpc("get_discovery_cards", {
      p_filters: {
        active_only: filters?.activeOnly === true,
        gender: filters?.genders?.length === 1 ? filters.genders[0] : null,
        height_max: hasExplicitHeightFilter ? filters?.heightMax : null,
        height_min: hasExplicitHeightFilter ? filters?.heightMin : null,
        lat,
        lng,
        max_age: Math.max(Math.max(16, filters?.ageMin ?? 16), filters?.ageMax ?? 99),
        min_age: Math.max(16, filters?.ageMin ?? 16),
        viewer_city: options?.viewerScope?.city ?? null,
        viewer_country: options?.viewerScope?.countryName ?? options?.viewerScope?.country ?? null,
        viewer_country_code: options?.viewerScope?.countryCode ?? null,
        viewer_district: options?.viewerScope?.district ?? null,
        only_waved: filters?.whoWavedAtMe === true,
        radius_m: Math.max(1000, Math.round((filters?.maxDistanceKm ?? 150) * 1000)),
        min_local_results: 50,
        degrees: degreeFilter,
        languages: languageFilter,
        orientations: orientationFilter,
        species: speciesFilter,
        tier: options?.effectiveTier ?? null,
      },
    }, options?.accessToken);
    if (error) {
      const message = String(error.message || "").toLowerCase();
      if (message.includes("age_blocked")) return { status: "age_blocked" as const, locationLabel: null, anchor: null, profiles: [] };
      if (message.includes("location_required")) return { status: "location_required" as const, locationLabel: null, anchor: null, profiles: [] };
      throw error;
    }

    const rawRows = Array.isArray(data) ? data : [];
    if (__DEV__) {
      console.log("NATIVE_DISCOVER_RPC_ROWS", {
        rpc: "get_discovery_cards",
        rawRowCount: rawRows.length,
        error: null,
        sampleIds: rawRows.slice(0, 5).map((value) => cleanId(asRecord(value).id)).filter(Boolean),
      });
    }

    const mappedProfiles = await Promise.all(rawRows
      .map((value) => asRecord(value))
      .filter((row) => cleanId(row.id) && cleanId(row.id) !== viewerId)
      .map((row) => hydrateDiscoveryProfileFromProfileViewSource(row)));

    if (__DEV__) {
      console.log("NATIVE_DISCOVER_MAPPED_PROFILES", {
        mappedProfileCount: mappedProfiles.length,
        droppedBeforeMapping: rawRows.length - mappedProfiles.length,
      });
    }

    const relationshipGuard = await fetchNativeDiscoveryRelationshipGuard(viewerId, { force: options?.force });
    const relationshipGuardedProfiles = mappedProfiles.filter((profile) => {
      const profileId = cleanId(profile.id);
      if (!profileId) return false;
      return !relationshipGuard.handledIds.has(profileId) &&
        !relationshipGuard.restrictedIds.has(profileId) &&
        !relationshipGuard.wavedAtViewerIds.has(profileId);
    });

    if (__DEV__) {
      console.log("NATIVE_DISCOVER_RELATIONSHIP_GUARD", {
        beforeRelationshipGuardCount: mappedProfiles.length,
        afterRelationshipGuardCount: relationshipGuardedProfiles.length,
        droppedByRelationshipGuardCount: mappedProfiles.length - relationshipGuardedProfiles.length,
      });
    }

    const serverFilteredProfiles = relationshipGuardedProfiles.filter((profile) => {
      if (filters?.verifiedOnly && !profile.isVerified) return false;
      if (filters?.hasCar && !profile.hasCar) return false;
      return true;
    });

    if (__DEV__) {
      console.log("NATIVE_DISCOVER_MATCHES_NATIVE_DISCOVERY_FILTERS", {
        beforeMatchesNativeDiscoveryFiltersCount: relationshipGuardedProfiles.length,
        afterMatchesNativeDiscoveryFiltersCount: serverFilteredProfiles.length,
        droppedByNativeDiscoveryFiltersCount: relationshipGuardedProfiles.length - serverFilteredProfiles.length,
      });
    }

    const result = {
      status: "ready" as const,
      locationLabel: options?.viewerScope?.district || options?.viewerScope?.country || null,
      anchor: lat !== null && lng !== null ? { lat, lng } : null,
      profiles: serverFilteredProfiles,
    };
    if (options?.cacheWriteGuard?.() !== false) nativeDiscoveryProfilesCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  })().finally(() => {
    for (const [key, value] of nativeDiscoveryProfilesInFlight.entries()) {
      if (value === request) nativeDiscoveryProfilesInFlight.delete(key);
    }
  });

  nativeDiscoveryProfilesInFlight.set(requestKey, request);
  return request;
}


export async function ensureNativeDirectChatRoom(targetUserId: string, targetName: string, options: { accessToken?: string | null; actorId?: string | null } = {}) {
  const target = cleanId(targetUserId);
  if (!target) throw new Error("missing_target_user");
  const targetLabel = targetName || "Conversation";
  const actorId = cleanId(options.actorId);
  if (!actorId) throw new Error("not_authenticated");
  if (actorId === target) throw new Error("cannot_chat_with_self");
  const { data, error } = await nativeChatRpc("ensure_direct_chat_room", {
    p_target_user_id: target,
    p_target_name: targetLabel,
  }, options.accessToken);
  if (error) throw new Error(error.message || "direct_chat_unavailable");
  const roomId = cleanId(data);
  if (!roomId) throw new Error("direct_chat_unavailable");
  return roomId;
}

export async function fetchNativeChatRoom(roomId: string, options: { accessToken?: string | null } = {}) {
  const id = cleanId(roomId);
  if (!id) throw new Error("missing_room");
  const snapshot = await fetchNativeChatDialogueSnapshot({ roomId: id, limit: 0, accessToken: options.accessToken });
  return snapshot.room;
}

export async function fetchNativeChatMembers(roomId: string, options: { accessToken?: string | null } = {}) {
  const id = cleanId(roomId);
  if (!id) throw new Error("missing_room");
  const snapshot = await fetchNativeChatDialogueSnapshot({ roomId: id, limit: 0, accessToken: options.accessToken });
  return snapshot.members;
}

export async function validateNativeDirectRoom(roomId: string, actorId: string, targetUserId: string, options: { accessToken?: string | null } = {}) {
  const chatId = cleanId(roomId);
  const actor = cleanId(actorId);
  const target = cleanId(targetUserId);
  if (!chatId || !actor || !target) throw new Error("direct_room_invalid");
  await assertNativeDirectRelationshipAllowed(actor, target, options.accessToken);
  const [room, members] = await Promise.all([
    fetchNativeChatRoom(chatId, { accessToken: options.accessToken }),
    fetchNativeChatMembers(chatId, { accessToken: options.accessToken }),
  ]);
  if (room?.type !== "direct") throw new Error("direct_room_type_mismatch");
  const memberIds = members.map((member) => member.userId).filter(Boolean);
  if (memberIds.length !== 2 || !memberIds.includes(actor) || !memberIds.includes(target)) {
    throw new Error("direct_room_member_mismatch");
  }
}

async function assertNativeDirectRelationshipAllowed(actorId: string, targetUserId: string, accessToken?: string | null) {
  const actor = cleanId(actorId);
  const target = cleanId(targetUserId);
  if (!actor || !target) throw new Error("direct_room_invalid");
  if (actor === target) throw new Error("cannot_chat_with_self");
  const { data, error } = await nativeChatRpc("check_native_direct_relationship", {
    p_target_user_id: target,
  }, accessToken);
  if (error) throw new Error("relationship_check_unavailable");
  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (row?.blocked === true) throw new Error("blocked_relationship");
  if (row?.unmatched === true) throw new Error("unmatched_relationship");
  if (row?.allowed !== true) throw new Error("relationship_unavailable");
}

export async function validateNativeGroupRoom(roomId: string, options: { accessToken?: string | null } = {}) {
  const chatId = cleanId(roomId);
  if (!chatId) throw new Error("missing_group");
  const room = await fetchNativeChatRoom(chatId, { accessToken: options.accessToken });
  if (room?.type !== "group") throw new Error("group_room_required");
  return room;
}

export async function fetchNativeChatMessages(options: {
  roomId: string;
  beforeCreatedAt?: string | null;
  limit?: number;
  accessToken?: string | null;
}) {
  const snapshot = await fetchNativeChatDialogueSnapshot(options);
  return snapshot.messages;
}

export async function fetchNativeChatDialogueSnapshot(options: {
  roomId: string;
  beforeCreatedAt?: string | null;
  limit?: number;
  targetMessageId?: string | null;
  accessToken?: string | null;
}) {
  const roomId = cleanId(options.roomId);
  if (!roomId) throw new Error("missing_room");
  const args = {
    p_chat_id: roomId,
    p_before_created_at: cleanString(options.beforeCreatedAt),
    p_limit: options.limit ?? 50,
    p_target_message_id: cleanId(options.targetMessageId),
  };
  let { data, error } = await nativeChatRpc("get_native_chat_dialogue_snapshot", args, options.accessToken);
  if (error && args.p_target_message_id && isRpcSignatureDrift(error)) {
    ({ data, error } = await nativeChatRpc("get_native_chat_dialogue_snapshot", {
      p_chat_id: roomId,
      p_before_created_at: cleanString(options.beforeCreatedAt),
      p_limit: options.limit ?? 50,
    }, options.accessToken));
  }
  if (error) throw error;
  return mapDialogueSnapshot(data);
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
  accessToken?: string | null;
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
  }, options.accessToken);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return mapRoom(row as Record<string, unknown>);
}

export async function sendNativeChatMessage(options: {
  roomId: string;
  senderId: string;
  content: string;
  accessToken?: string | null;
}) {
  const roomId = cleanId(options.roomId);
  const senderId = cleanId(options.senderId);
  if (!roomId) throw new Error("missing_room");
  if (!senderId) throw new Error("missing_sender");
  if (__DEV__) console.log("NATIVE_CHAT_SEND_RPC_START", {
    hasAccessToken: Boolean(options.accessToken),
    roomId,
  });
  const { data, error } = await nativeChatRpc("send_native_chat_message", {
    p_chat_id: roomId,
    p_content: options.content,
  }, options.accessToken);
  if (error) {
    if (__DEV__) console.warn("NATIVE_CHAT_SEND_RPC_ERROR", {
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : null,
      message: error.message || "send_failed",
      roomId,
    });
    throw error;
  }
  if (__DEV__) console.log("NATIVE_CHAT_SEND_RPC_RESULT", {
    isArray: Array.isArray(data),
    rawDataShape: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
    roomId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return mapMessage(asRecord(row));
}

export async function markNativeChatMessagesRead(options: {
  roomId: string;
  userId: string;
  messageIds: string[];
  accessToken?: string | null;
}) {
  const roomId = cleanId(options.roomId);
  const userId = cleanId(options.userId);
  if (!roomId) throw new Error("missing_room");
  if (!userId) throw new Error("missing_user");
  const messageIds = Array.from(new Set(options.messageIds.map(cleanId).filter((id): id is string => Boolean(id))));
  const visibleMessageId = messageIds.at(-1) ?? null;
  if (!visibleMessageId) return [];
  const { data, error } = await nativeChatRpc("mark_room_read", { p_chat_id: roomId, p_visible_message_id: visibleMessageId }, options.accessToken);
  if (error) throw error;
  await invalidateNativeChatReadCaches(userId);
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRead);
}

export async function markNativeChatRoomRead(options: { roomId: string; userId: string; accessToken?: string | null }) {
  const roomId = cleanId(options.roomId);
  const userId = cleanId(options.userId);
  if (!roomId) throw new Error("missing_room");
  if (!userId) throw new Error("missing_user");
  const { data, error } = await nativeChatRpc("mark_room_read", { p_chat_id: roomId }, options.accessToken);
  if (error) throw error;
  await invalidateNativeChatReadCaches(userId);
  return Array.isArray(data) ? data : [];
}

export async function archiveNativeChatRoomForCurrentUser(roomId: string, options: { accessToken?: string | null } = {}) {
  const chatId = cleanId(roomId);
  if (!chatId) throw new Error("missing_room");
  const { data, error } = await nativeChatRpc("archive_chat_for_current_user", { p_chat_id: chatId }, options.accessToken);
  if (error) throw error;
  return data;
}

export async function fetchNativeReadReceipts(messageIds: string[], viewerUserId: string, options: { accessToken?: string | null } = {}) {
  const cleanMessageIds = Array.from(new Set(messageIds.map(cleanId).filter((id): id is string => Boolean(id))));
  const viewer = cleanId(viewerUserId);
  if (cleanMessageIds.length === 0 || !viewer) return new Set<string>();
  const { data, error } = await nativeChatRpc("get_native_chat_read_receipts", {
    p_message_ids: cleanMessageIds,
  }, options.accessToken);
  if (error) throw error;
  return new Set(((Array.isArray(data) ? data : []) as Array<{ message_id?: string | null }>).map((row) => cleanId(row.message_id)).filter((id): id is string => Boolean(id)));
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
  const nonce = (cleanString(options.nonce) ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!nonce) throw new Error("invalid_attachment_name");
  return `${userId}/chat-media/${roomId}/${nonce}.${safeFileExtension(options.fileName)}`;
}

export async function uploadNativeChatAttachment(options: {
  userId: string;
  roomId: string;
  fileName: string;
  mime: string;
  body: ArrayBuffer | Uint8Array | Blob;
  size?: number | null;
  accessToken?: string | null;
}) {
  const path = createNativeChatAttachmentPath({
    userId: options.userId,
    roomId: options.roomId,
    fileName: options.fileName,
  });
  try {
    await uploadNativeChatStorageObject({
      accessToken: options.accessToken,
      bucket: NATIVE_CHAT_ATTACHMENTS_BUCKET,
      path,
      body: options.body,
      contentType: options.mime || undefined,
      upsert: false,
    });
  } catch (error) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      originalError: error,
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  }
  try {
    await registerNativeChatMediaAsset({
      accessToken: options.accessToken,
      bucket: NATIVE_CHAT_ATTACHMENTS_BUCKET,
      contentType: "chat_message",
      objectPath: path,
    });
  } catch (error) {
    const cleanupResult = await requestNativeStorageCleanupResult("chat_attachments", path, "register_chat_attachment_failed", options.accessToken);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  return {
    bucket: NATIVE_CHAT_ATTACHMENTS_BUCKET,
    path,
    url: null,
    name: options.fileName || "attachment",
    mime: options.mime || "",
    size: options.size ?? null,
  } satisfies NativeChatAttachment;
}

export async function deleteOwnNativeChatAttachment(options: {
  accessToken?: string | null;
  userId: string;
  path: string;
}) {
  const userId = cleanId(options.userId);
  const path = cleanString(options.path);
  if (!userId) throw new Error("missing_user");
  if (!path) throw new Error("missing_attachment");
  if (!path.startsWith(`${userId}/`)) throw new Error("attachment_owner_mismatch");
  const cleanupResult = await requestNativeStorageCleanupResult("chat_attachments", path, "delete_chat_attachment", options.accessToken);
  if (cleanupResult === "failed") {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "delete",
      originalError: new Error("delete_chat_attachment_cleanup_failed"),
      cleanupAttempted: true,
      cleanupResult,
    });
  }
}
