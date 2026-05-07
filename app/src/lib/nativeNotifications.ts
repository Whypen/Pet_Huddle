import { supabase } from "./supabase";

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

type NativeNotificationQuery = {
  select: (columns: string) => NativeNotificationSelect;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: unknown) => {
      eq: (column: string, value: unknown) => Promise<unknown>;
    };
  };
};

type NativeNotificationSelect = {
  limit: (count: number) => NativeNotificationSelect;
  eq: (column: string, value: unknown) => {
    eq: (column: string, value: unknown) => Promise<{ data: unknown[] | null }>;
    order: (column: string, options: { ascending: boolean }) => {
      limit: (count: number) => Promise<{ data: unknown[] | null }>;
    };
  };
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
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

  let nextPath = directCandidate;
  if (!nextPath && chatTarget && (
    ["chat", "chats", "message", "chat_message", "direct_message", "group_chat", "group_message"].includes(normalizedType) ||
    normalizedType.includes("chat") ||
    normalizedType.includes("message")
  )) {
    const params = new URLSearchParams({ room: chatTarget });
    if (chatName) params.set("name", chatName);
    if (chatPeer) params.set("with", chatPeer);
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

export const fetchNativeNotifications = async (userId: string, limit = 200) => {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const notificationQuery = supabase.from("notifications") as unknown as NativeNotificationQuery;
  const { data } = await notificationQuery
    .select("id,message,title,body,type,href,read,created_at,metadata,data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  const rows = Array.isArray(data) ? data as NativeNotificationRow[] : [];
  return rows.filter((row) => !isSuppressedNativeNotification(row));
};

export const fetchNativeUnreadNotificationCount = async (userId: string) => {
  const notificationQuery = supabase.from("notifications") as unknown as NativeNotificationQuery;
  const { data } = await notificationQuery
    .select("id,message,body,title,metadata,data")
    .limit(200)
    .eq("user_id", userId)
    .eq("read", false);
  const rows = Array.isArray(data) ? data as NativeNotificationRow[] : [];
  return rows.filter((row) => !isSuppressedNativeNotification(row)).length;
};

export const markNativeNotificationRead = async (userId: string, notificationId: string) => {
  const notificationQuery = supabase.from("notifications") as unknown as NativeNotificationQuery;
  await notificationQuery.update({ read: true }).eq("id", notificationId).eq("user_id", userId);
};

export const markAllNativeNotificationsRead = async (userId: string) => {
  const notificationQuery = supabase.from("notifications") as unknown as NativeNotificationQuery;
  await notificationQuery.update({ read: true }).eq("user_id", userId).eq("read", false);
};
