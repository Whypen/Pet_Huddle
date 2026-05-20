import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { fetchNativeMapAlertById } from "./nativeMapData";
import { resolveNativeViewerScope, type NativeViewerScopePoint } from "./nativeViewerScope";

export type NativeNotificationRow = {
  id: string;
  message?: string | null;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  href?: string | null;
  read?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};

type NativeNotificationAlertScope =
  | { mode: "primary_point"; anchorPoint: NativeViewerScopePoint; country: string | null; district: string | null }
  | { mode: "country_district_fallback"; anchorPoint: null; country: string | null; district: string | null }
  | { mode: "unresolved"; anchorPoint: null; country: null; district: null };

const NOTIFICATION_CACHE_VERSION = 1;
const NOTIFICATION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type NativeNotificationRowsCachePayload = {
  cachedAt: number;
  rows: NativeNotificationRow[];
  sessionKey: string;
  userId: string;
  version: number;
};

type NativeNotificationUnreadCachePayload = {
  cachedAt: number;
  count: number;
  sessionKey: string;
  userId: string;
  version: number;
};

const notificationSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const notificationRowsCacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_notifications:v1:${userId}:${notificationSessionKey(userId, sessionKey)}`;
const notificationUnreadCacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_notification_unread:v1:${userId}:${notificationSessionKey(userId, sessionKey)}`;
const notificationRowsMemoryCache = new Map<string, NativeNotificationRowsCachePayload>();
const notificationUnreadMemoryCache = new Map<string, NativeNotificationUnreadCachePayload>();

const isFreshNotificationCache = (cachedAt: number) => Date.now() - cachedAt <= NOTIFICATION_CACHE_MAX_AGE_MS;

export const readCachedNativeNotifications = async (userId: string, options: { sessionKey?: string | null } = {}) => {
  const sessionKey = notificationSessionKey(userId, options.sessionKey);
  const key = notificationRowsCacheKey(userId, sessionKey);
  const memory = notificationRowsMemoryCache.get(key);
  if (memory && memory.userId === userId && memory.sessionKey === sessionKey && isFreshNotificationCache(memory.cachedAt)) return memory.rows;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeNotificationRowsCachePayload>;
    if (
      parsed.version !== NOTIFICATION_CACHE_VERSION ||
      parsed.userId !== userId ||
      parsed.sessionKey !== sessionKey ||
      typeof parsed.cachedAt !== "number" ||
      !isFreshNotificationCache(parsed.cachedAt) ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    const payload: NativeNotificationRowsCachePayload = {
      cachedAt: parsed.cachedAt,
      rows: parsed.rows as NativeNotificationRow[],
      sessionKey,
      userId,
      version: NOTIFICATION_CACHE_VERSION,
    };
    notificationRowsMemoryCache.set(key, payload);
    return payload.rows;
  } catch {
    return null;
  }
};

export const writeNativeNotificationsCache = async (userId: string, rows: NativeNotificationRow[], options: { cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {}) => {
  if (options.cacheWriteGuard?.() === false) return;
  const sessionKey = notificationSessionKey(userId, options.sessionKey);
  const payload: NativeNotificationRowsCachePayload = {
    cachedAt: Date.now(),
    rows,
    sessionKey,
    userId,
    version: NOTIFICATION_CACHE_VERSION,
  };
  const key = notificationRowsCacheKey(userId, sessionKey);
  notificationRowsMemoryCache.set(key, payload);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const readCachedNativeUnreadNotificationCount = async (userId: string, options: { sessionKey?: string | null } = {}) => {
  const sessionKey = notificationSessionKey(userId, options.sessionKey);
  const key = notificationUnreadCacheKey(userId, sessionKey);
  const memory = notificationUnreadMemoryCache.get(key);
  if (memory && memory.userId === userId && memory.sessionKey === sessionKey && isFreshNotificationCache(memory.cachedAt)) return memory.count;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeNotificationUnreadCachePayload>;
    if (
      parsed.version !== NOTIFICATION_CACHE_VERSION ||
      parsed.userId !== userId ||
      parsed.sessionKey !== sessionKey ||
      typeof parsed.cachedAt !== "number" ||
      !isFreshNotificationCache(parsed.cachedAt) ||
      typeof parsed.count !== "number"
    ) {
      return null;
    }
    const payload: NativeNotificationUnreadCachePayload = {
      cachedAt: parsed.cachedAt,
      count: Math.max(0, Math.floor(parsed.count)),
      sessionKey,
      userId,
      version: NOTIFICATION_CACHE_VERSION,
    };
    notificationUnreadMemoryCache.set(key, payload);
    return payload.count;
  } catch {
    return null;
  }
};

export const writeNativeUnreadNotificationCountCache = async (userId: string, count: number, options: { cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {}) => {
  if (options.cacheWriteGuard?.() === false) return;
  const sessionKey = notificationSessionKey(userId, options.sessionKey);
  const payload: NativeNotificationUnreadCachePayload = {
    cachedAt: Date.now(),
    count: Math.max(0, Math.floor(count)),
    sessionKey,
    userId,
    version: NOTIFICATION_CACHE_VERSION,
  };
  const key = notificationUnreadCacheKey(userId, sessionKey);
  notificationUnreadMemoryCache.set(key, payload);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedText = (value: unknown) => String(value || "").trim().toLowerCase();

const distanceMeters = (left: NativeViewerScopePoint, right: NativeViewerScopePoint) => {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(right.lat - left.lat);
  const dLng = toRad(right.lng - left.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(left.lat)) * Math.cos(toRad(right.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const resolveNativeNotificationAlertScope = async ({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}): Promise<NativeNotificationAlertScope> => {
  const viewerScope = await resolveNativeViewerScope({ userId, accessToken });
  const country = viewerScope.country ?? null;
  const district = viewerScope.district ?? null;
  if (viewerScope.primaryPoint) {
    return { mode: "primary_point", anchorPoint: viewerScope.primaryPoint, country, district };
  }
  if (country || district) {
    return { mode: "country_district_fallback", anchorPoint: null, country, district };
  }
  return { mode: "unresolved", anchorPoint: null, country: null, district: null };
};

export const firstNotificationText = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "Notification";
};

export const notificationTimeAgo = (value?: string | null) => {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const isSuppressedNativeNotification = (row: Pick<NativeNotificationRow, "message" | "body" | "title" | "data" | "metadata">) => {
  const data = row.data || {};
  const metadata = row.metadata || {};
  const text = firstNotificationText(row.message, row.body, row.title).toLowerCase();
  return data.skip_history === true || metadata.skip_history === true || text === "your alert has expired and is no longer visible";
};

const isAlertNotification = (row: NativeNotificationRow) => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) };
  const type = normalizedText(row.type || meta.type || meta.alert_type || meta.alertType);
  const href = normalizedText(row.href || meta.href || meta.path || meta.route);
  return Boolean(
    meta.alert_id ||
    meta.alertId ||
    meta.broadcast_id ||
    meta.broadcastId ||
    type.includes("alert") ||
    type.includes("broadcast") ||
    href.startsWith("/map"),
  );
};

const notificationAlertPoint = (row: NativeNotificationRow): NativeViewerScopePoint | null => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) };
  const lat = numberValue(meta.alert_lat ?? meta.alertLat ?? meta.lat ?? meta.latitude);
  const lng = numberValue(meta.alert_lng ?? meta.alertLng ?? meta.lng ?? meta.longitude);
  return lat === null || lng === null ? null : { lat, lng };
};

const notificationAlertId = (row: NativeNotificationRow) => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) };
  return firstString(meta.alert_id, meta.alertId, meta.map_id, meta.mapId, meta.broadcast_id, meta.broadcastId);
};

const withResolvedAlertScopeMetadata = async (
  rows: NativeNotificationRow[],
  userId: string,
  accessToken: string,
) => {
  const alertIds = Array.from(new Set(rows
    .filter(isAlertNotification)
    .filter((row) => !notificationAlertPoint(row))
    .map(notificationAlertId)
    .filter((alertId): alertId is string => Boolean(alertId))));
  if (alertIds.length === 0) return rows;

  const details = new Map<string, Awaited<ReturnType<typeof fetchNativeMapAlertById>>>();
  await Promise.all(alertIds.map(async (alertId) => {
    const alert = await fetchNativeMapAlertById(alertId, userId, { accessToken }).catch(() => null);
    details.set(alertId, alert);
  }));

  return rows.map((row) => {
    const alertId = notificationAlertId(row);
    const alert = alertId ? details.get(alertId) ?? null : null;
    if (!alert) return row;
    const metadata = {
      ...(row.metadata || {}),
      alert_lat: alert.latitude,
      alert_lng: alert.longitude,
      range_m: alert.range_meters ?? undefined,
    };
    return { ...row, metadata };
  });
};

const isNotificationInAlertScope = (row: NativeNotificationRow, scope: NativeNotificationAlertScope) => {
  if (!isAlertNotification(row)) return true;
  const meta = { ...(row.metadata || {}), ...(row.data || {}) };
  const alertPoint = notificationAlertPoint(row);
  if (scope.anchorPoint) {
    if (!alertPoint) return false;
    const radiusMeters = numberValue(meta.radius_m ?? meta.radiusMeters ?? meta.range_m ?? meta.rangeMeters) ?? 5000;
    return distanceMeters(scope.anchorPoint, alertPoint) <= Math.max(0, radiusMeters);
  }
  const alertCountry = normalizedText(meta.country ?? meta.location_country ?? meta.locationCountry);
  const alertDistrict = normalizedText(meta.district ?? meta.location_district ?? meta.locationDistrict);
  const scopeCountry = normalizedText(scope.country);
  const scopeDistrict = normalizedText(scope.district);
  if (alertDistrict && scopeDistrict) return alertDistrict === scopeDistrict;
  if (alertCountry && scopeCountry) return alertCountry === scopeCountry;

  return true;
};

const filterNotificationsForAlertScope = (rows: NativeNotificationRow[], scope: NativeNotificationAlertScope) =>
  rows.filter((row) => !isSuppressedNativeNotification(row) && isNotificationInAlertScope(row, scope));

const allowedNotificationPath = (path: string) =>
  /^\/(social|chats|map|threads|chat-dialogue|verify-identity|pet-details|edit-pet-profile|settings|notifications)(\?|$)/.test(path);

const normalizePathCandidate = (candidate: unknown) => {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const value = candidate.trim();
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "huddle.pet" || parsed.hostname === "www.huddle.pet") {
      return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    return null;
  }
  return null;
};

export const notificationDestinationPath = (row: NativeNotificationRow) => {
  const data = row.data || {};
  const metadata = row.metadata || {};
  const meta = { ...metadata, ...data };
  const type = String(row.type || meta.type || "").toLowerCase();
  const normalizedType = type.replace(/[^a-z0-9]+/g, "_");
  const body = firstNotificationText(row.body, row.message, row.title).toLowerCase();
  const shouldForceDiscover = type === "wave" || body.includes("open discover to find out");

  if (shouldForceDiscover) return "/chats?tab=discover";
  if (normalizedType === "family_invite" || meta.kind === "family_invite") return "/settings?family=1";

  const directCandidate = [
    row.href,
    data.path,
    data.href,
    data.url,
    data.link,
    data.deepLink,
    data.route,
    metadata.path,
    metadata.href,
    metadata.url,
    metadata.link,
    metadata.deepLink,
    metadata.route,
  ]
    .map(normalizePathCandidate)
    .find((path): path is string => Boolean(path));

  const socialTarget = firstString(
    meta.thread_id,
    meta.threadId,
    meta.post_id,
    meta.postId,
    meta.thread,
    meta.threadId,
    meta.social_post_id,
    meta.socialPostId,
    meta.subject_id,
    meta.subjectId,
    meta.content_id,
    meta.contentId,
  );
  const alertTarget = firstString(
    meta.alert_id,
    meta.alertId,
    meta.map_id,
    meta.mapId,
    meta.broadcast_id,
    meta.broadcastId,
    meta.alert,
    meta.broadcast,
    meta.subject_id,
    meta.subjectId,
    meta.content_id,
    meta.contentId,
  );
  const chatTarget = firstString(
    meta.chat_id,
    meta.chatId,
    meta.room_id,
    meta.roomId,
    meta.chat_room_id,
    meta.chatRoomId,
    meta.conversation_id,
    meta.conversationId,
  );
  const chatName = firstString(meta.chat_name, meta.chatName, meta.room_name, meta.roomName, meta.name);
  const chatPeer = firstString(meta.with, meta.with_user_id, meta.withUserId, meta.peer_user_id, meta.peerUserId);
  const chatMessage = firstString(meta.targetMessage, meta.target_message, meta.message_id, meta.messageId);

  let nextPath = directCandidate;
  if (!nextPath && chatTarget && (
    ["chat", "chats", "message", "chat_message", "direct_message", "group_chat", "group_message"].includes(normalizedType) ||
    normalizedType.includes("chat") ||
    normalizedType.includes("message")
  )) {
    const params = new URLSearchParams({ room: chatTarget });
    if (chatName) params.set("name", chatName);
    if (chatPeer) params.set("with", chatPeer);
    if (chatMessage) params.set("targetMessage", chatMessage);
    nextPath = `/chat-dialogue?${params.toString()}`;
  }
  if (!nextPath && socialTarget && ["social", "like", "comment", "reply", "mention", "thread", "thread_like", "thread_comment", "social_like", "social_comment"].includes(normalizedType)) {
    nextPath = `/social?focus=${encodeURIComponent(socialTarget)}`;
  }
  if (!nextPath && alertTarget && (
    ["alert", "alert_like", "alert_support", "broadcast", "broadcast_alert", "mesh_alert", "map", "map_alert"].includes(normalizedType) ||
    normalizedType.includes("alert") ||
    normalizedType.includes("broadcast")
  )) {
    nextPath = `/map?alert=${encodeURIComponent(alertTarget)}`;
  }
  if (!nextPath) return null;

  if (nextPath.startsWith("/map")) {
    const [, rawQuery = ""] = nextPath.split("?");
    const params = new URLSearchParams(rawQuery);
    if (!params.get("alert") && alertTarget) params.set("alert", alertTarget);
    const query = params.toString();
    nextPath = query ? `/map?${query}` : "/map";
  }

  return allowedNotificationPath(nextPath) ? nextPath : null;
};

export const fetchNativeUnreadNotificationCountWithToken = async (
  userId: string,
  accessToken: string,
  options: { cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {},
) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("notification_unread_access_token_required");
  const scope = await resolveNativeNotificationAlertScope({ userId, accessToken: token });
  const params = new URLSearchParams({
    select: "id,message,body,title,metadata,data",
    limit: "200",
    user_id: `eq.${userId}`,
    read: "eq.false",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  const rows = Array.isArray(parsed) ? parsed as NativeNotificationRow[] : [];
  const scopedRows = await withResolvedAlertScopeMetadata(rows, userId, token);
  const count = filterNotificationsForAlertScope(scopedRows, scope).length;
  await writeNativeUnreadNotificationCountCache(userId, count, options);
  return count;
};

export const fetchNativeNotificationsWithToken = async (
  userId: string,
  accessToken: string,
  limit = 200,
  options: { cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {},
) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("notifications_access_token_required");
  const scope = await resolveNativeNotificationAlertScope({ userId, accessToken: token });
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const params = new URLSearchParams({
    select: "id,message,title,body,type,href,read,created_at,metadata,data",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(safeLimit),
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  const rows = Array.isArray(parsed) ? parsed as NativeNotificationRow[] : [];
  const scopedRows = await withResolvedAlertScopeMetadata(rows, userId, token);
  const filteredRows = filterNotificationsForAlertScope(scopedRows, scope);
  await writeNativeNotificationsCache(userId, filteredRows, options);
  await writeNativeUnreadNotificationCountCache(userId, filteredRows.filter((row) => row.read !== true).length, options);
  return filteredRows;
};

export const markAllNativeNotificationsReadWithToken = async (userId: string, accessToken: string) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("notifications_mark_read_access_token_required");
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    read: "eq.false",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ read: true }),
  });
  if (!response.ok) {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
};
