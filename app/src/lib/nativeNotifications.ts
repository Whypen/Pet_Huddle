import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import { withNativeMapAlertRouteContext } from "./nativeAlertNotificationRoute";
import { canonicalizeNativeNotificationPath } from "./nativeNavigationState";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";

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

const NOTIFICATION_CACHE_VERSION = 1;
const NOTIFICATION_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const NOTIFICATION_OWNERSHIP_TIMEOUT_MS = 4_000;
const TEAM_HUDDLE_NOTIFICATION_USER_ID = "8f55ab31-6b25-4d1a-98c7-3a6e8af2d941";

export type NativeNotificationOwnership = "owned" | "not_owned" | "unavailable";

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
    const raw = await readNativeDisplayCacheItem(key);
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
    const raw = await readNativeDisplayCacheItem(key);
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

export const verifyNativeNotificationOwnershipWithToken = async (
  notificationId: string,
  userId: string,
  accessToken: string,
): Promise<NativeNotificationOwnership> => {
  const cleanNotificationId = String(notificationId || "").trim();
  const cleanUserId = String(userId || "").trim();
  const cleanAccessToken = String(accessToken || "").trim();
  if (!cleanNotificationId || !cleanUserId || !cleanAccessToken) return "not_owned";
  const params = new URLSearchParams({
    select: "id",
    id: `eq.${cleanNotificationId}`,
    user_id: `eq.${cleanUserId}`,
    limit: "1",
  });
  try {
    // A notification tap is an interactive route handoff. Do not use the raw
    // supabase-js query here: its iOS socket can stay unresolved for minutes,
    // poisoning this response as "handled" before navigation ever runs.
    const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
      headers: createNativeAuthenticatedHeaders(cleanAccessToken),
    }, NOTIFICATION_OWNERSHIP_TIMEOUT_MS);
    const raw = await response.text();
    if (!response.ok) return "unavailable";
    const rows = raw ? JSON.parse(raw) as Array<{ id?: unknown }> : [];
    return Array.isArray(rows) && rows.some((row) => String(row?.id || "") === cleanNotificationId)
      ? "owned"
      : "not_owned";
  } catch {
    return "unavailable";
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

export const firstNotificationText = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "Notification";
};

// The in-app hub is a single-line list, never push's separate title/body split
// (that stacked bold-subject-above-body layout is push/OS-tray only). Several
// kinds have a title that's just the person's name and a body that's a short
// verb phrase assuming that name comes first ("Sent you a message", "Liked your
// post") — those get woven into one complete sentence. Group invite and pet
// reminder need the same treatment but in the other word order. Everything
// else's body already reads as a complete sentence on its own.
const resolveNotificationKind = (row: Pick<NativeNotificationRow, "type" | "data" | "metadata">) => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) } as Record<string, unknown>;
  return String(meta.kind || row.type || "").trim();
};

const lowerFirst = (value: string) => (value ? value.charAt(0).toLowerCase() + value.slice(1) : value);

// Title = the actor's name, body = a short verb phrase that assumes the name
// comes first ("Sent you a message" -> "{Name} sent you a message").
const WEAVE_NAME_BEFORE_BODY_KINDS = new Set([
  "new_message",
  "care_chat_message",
  "like",
  "comment_like",
  "reply_like",
  "comment",
  "reply",
  "mention",
  "thread_mention",
  "thread_reply",
  "alert_like",
  "star",
  "friend_added",
  "group_event_created",
  "group_event_updated",
]);

export const notificationHubText = (
  row: Pick<NativeNotificationRow, "message" | "body" | "title" | "type" | "data" | "metadata">,
): string => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) } as Record<string, unknown>;
  const explicitHubBody = String(meta.hubBody || "").trim();
  if (explicitHubBody) return explicitHubBody;

  const rawMessage = String(row.message || "").trim();
  const rawBody = String(row.body || "").trim();
  const bodyText = firstNotificationText(row.body, row.message);
  const titleText = String(row.title || "").trim();
  const kind = resolveNotificationKind(row);

  if (kind === "group_invite") {
    return titleText ? `${bodyText} ${titleText}`.trim() : bodyText;
  }
  if (kind === "reminder") {
    const petName = titleText.replace(/'s Reminder$/i, "").trim();
    return petName ? `${petName}: ${bodyText}` : bodyText || titleText;
  }
  if (kind === "engagement_tier_promotion") {
    // Title is the tier label ("Trusted ✨"), body is already a full standalone
    // sentence — join with a dash instead of the verb-phrase weave below, since
    // there's no shared subject to merge, just a label plus a sentence.
    return titleText && titleText !== bodyText ? `${titleText} — ${bodyText}` : bodyText || titleText;
  }
  if (titleText && titleText !== bodyText && WEAVE_NAME_BEFORE_BODY_KINDS.has(kind)) {
    if (rawMessage && rawBody && rawMessage !== rawBody) return rawMessage;
    return `${titleText} ${lowerFirst(bodyText)}`.trim();
  }
  return bodyText || titleText;
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

// Delivery is the audience decision. The hub trusts complete notification rows
// and never re-runs GPS/map eligibility while opening.
const filterHubNotifications = (rows: NativeNotificationRow[]) =>
  rows.filter((row) => !isSuppressedNativeNotification(row));

// Must stay in sync with the routable screens in RootNavigator's normalizePath:
// any href that resolves to a real screen has to be allowed here, otherwise the
// notification is silently nulled and its row becomes untappable. (Legacy hrefs
// like /verify and /pets are intentionally excluded — they map to no screen.)
const allowedNotificationPath = (path: string) =>
  path === "/" || /^\/(social|chats|threads|service-chat|service|map|chat-dialogue|verify-identity|pet-details|edit-pet-profile|edit-profile|profile|carerprofile|premium|settings|notifications)(\?|$)/.test(path);

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
  const directNotificationPeer = ["new_message", "direct_message", "match", "star"].includes(normalizedType)
    ? firstString(meta.sender_id, meta.senderId, meta.from_user_id, meta.fromUserId, meta.matched_user_id, meta.matchedUserId)
    : "";
  const chatPeer = firstString(meta.with, meta.with_user_id, meta.withUserId, meta.peer_user_id, meta.peerUserId, directNotificationPeer);
  const chatAvatar = firstString(meta.avatar, meta.avatar_url, meta.avatarUrl, meta.peer_avatar_url, meta.peerAvatarUrl, meta.sender_avatar_url, meta.senderAvatarUrl);
  const chatMessage = firstString(meta.targetMessage, meta.target_message, meta.message_id, meta.messageId);

  // A friend request is an inbox item, not a message. Even if an older payload
  // happens to carry a room id, opening it must land on the Friends list where
  // accepting/declining the request marks that inbox item handled.
  let nextPath = normalizedType === "friend_request" ? "/chats?tab=friends" : directCandidate;
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

  if (nextPath.startsWith("/chat-dialogue") || nextPath.startsWith("/service-chat")) {
    const [pathname, rawQuery = ""] = nextPath.split("?");
    const params = new URLSearchParams(rawQuery);
    if (!params.get("name") && chatName) params.set("name", chatName);
    if (!params.get("with") && chatPeer) params.set("with", chatPeer);
    if (!params.get("avatar") && chatAvatar) params.set("avatar", chatAvatar);
    if (!params.get("targetMessage") && chatMessage) params.set("targetMessage", chatMessage);
    const roomType = (firstString(meta.room_type, meta.roomType, meta.chat_type, meta.chatType) || "").toLowerCase();
    if (!params.get("returnTo")) {
      params.set("returnTo", nextPath.startsWith("/service-chat") || roomType === "service" ? "/chats?tab=service" : roomType === "group" ? "/chats?tab=groups" : "/chats?tab=friends");
    }
    nextPath = `${pathname}?${params.toString()}`;
  }

  if (nextPath.startsWith("/map")) {
    const alertLat = numberValue(meta.alert_lat ?? meta.alertLat ?? meta.latitude ?? meta.lat);
    const alertLng = numberValue(meta.alert_lng ?? meta.alertLng ?? meta.longitude ?? meta.lng);
    const alertType = firstString(meta.alert_type, meta.alertType);
    nextPath = withNativeMapAlertRouteContext(nextPath, {
      alertId: alertTarget,
      alertLat,
      alertLng,
      alertType,
      verifiedOnly: meta.verified_only === true,
    });
  }

  // Team huddle is an official direct conversation in Friends. Repair older
  // notifications that did not store the direct peer or a return destination.
  const notificationPeer = firstString(
    meta.sender_id,
    meta.senderId,
    meta.with_user_id,
    meta.withUserId,
    meta.peer_user_id,
    meta.peerUserId,
  );
  if (nextPath.startsWith("/chat-dialogue") && notificationPeer === TEAM_HUDDLE_NOTIFICATION_USER_ID) {
    const [pathname, rawQuery = ""] = nextPath.split("?");
    const params = new URLSearchParams(rawQuery);
    if (!params.get("with")) params.set("with", TEAM_HUDDLE_NOTIFICATION_USER_ID);
    if (!params.get("returnTo")) params.set("returnTo", "/chats?tab=friends");
    nextPath = `${pathname}?${params.toString()}`;
  }

  nextPath = canonicalizeNativeNotificationPath(nextPath);
  return allowedNotificationPath(nextPath) ? nextPath : null;
};

export const fetchNativeUnreadNotificationCountWithToken = async (
  userId: string,
  accessToken: string,
  options: { cacheWriteGuard?: () => boolean; onFriendRequestUnreadChange?: (unread: boolean) => void; sessionKey?: string | null } = {},
) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("notification_unread_access_token_required");
  const params = new URLSearchParams({
    select: "id,message,body,title,type,metadata,data",
    limit: "200",
    user_id: `eq.${userId}`,
    read: "eq.false",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    headers: createNativeAuthenticatedHeaders(token),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  const rows = Array.isArray(parsed) ? parsed as NativeNotificationRow[] : [];
  const unreadRows = filterHubNotifications(rows);
  const count = unreadRows.length;
  options.onFriendRequestUnreadChange?.(unreadRows.some((row) => String(row.type || "").toLowerCase() === "friend_request"));
  await writeNativeUnreadNotificationCountCache(userId, count, options);
  return count;
};

export const fetchNativeNotificationsWithToken = async (
  userId: string,
  accessToken: string,
  limit = 200,
  options: { cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {},
) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("notifications_access_token_required");
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const params = new URLSearchParams({
    select: "id,message,title,body,type,href,read,created_at,metadata,data",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(safeLimit),
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    headers: createNativeAuthenticatedHeaders(token),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : [];
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  const rows = Array.isArray(parsed) ? parsed as NativeNotificationRow[] : [];
  const filteredRows = filterHubNotifications(rows);
  await writeNativeNotificationsCache(userId, filteredRows, options);
  await writeNativeUnreadNotificationCountCache(userId, filteredRows.filter((row) => row.read !== true).length, options);
  return filteredRows;
};

export const markAllNativeNotificationsReadWithToken = async (userId: string, accessToken: string) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("notifications_mark_read_access_token_required");
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    read: "eq.false",
    or: "(type.neq.friend_request,type.is.null)",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    method: "PATCH",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    body: JSON.stringify({ read: true }),
  });
  if (!response.ok) {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
};

export const markNativeFriendRequestNotificationsReadWithToken = async (userId: string, accessToken: string) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("friend_request_notifications_mark_read_access_token_required");
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    read: "eq.false",
    type: "eq.friend_request",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?${params.toString()}`, {
    method: "PATCH",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    body: JSON.stringify({ read: true }),
  });
  if (!response.ok) {
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
};
