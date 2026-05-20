import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import * as FileSystem from "expo-file-system/legacy";
import { buildShareModel, serializeChatShareMessage } from "./shareModel";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { registerNativeMediaAsset } from "./nativeMediaAssets";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult, type NativeProtectedActionCleanupResult } from "./nativeStorageCleanup";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import type { NativeViewerScope } from "./nativeViewerScope";

export type NativeSocialSortMode = "Latest" | "Trending" | "Saves";

const recordedSocialFeedEventKeys = new Set<string>();
const passiveSocialFeedEventWindow: number[] = [];
const PASSIVE_SOCIAL_FEED_EVENT_LIMIT = 3;
const PASSIVE_SOCIAL_FEED_EVENT_WINDOW_MS = 10_000;

export type NativeSocialFeedCursor = {
  created_at: string;
  id: string;
  score?: number | null;
};

export type NativeSocialAuthor = {
  displayName: string | null;
  socialId: string | null;
  avatarUrl: string | null;
  verificationStatus: string | null;
  locationCountry: string | null;
  isVerified: boolean;
  nonSocial: boolean;
};

export type NativeSocialMentionEntry = {
  start: number;
  end: number;
  mentionedUserId: string;
  socialIdAtTime: string;
};

export type NativeSocialMentionSuggestion = {
  userId: string;
  socialId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type NativeSocialLinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  loading?: boolean;
  failed?: boolean;
  resolved?: boolean;
  error?: string;
};

export type NativeSocialFeedEventType =
  | "impression"
  | "dwell_10s"
  | "profile_view"
  | "expand_post"
  | "save"
  | "comment"
  | "like"
  | "share"
  | "hide"
  | "block"
  | "open_comments";

export type NativeSocialThread = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  hashtags: string[];
  mentions: NativeSocialMentionEntry[];
  images: string[];
  createdAt: string;
  updatedAt: string | null;
  userId: string;
  likes: number;
  commentCount: number;
  shareCount: number;
  score: number;
  mapId: string | null;
  alertType: string | null;
  alertDistrict: string | null;
  hasAlertLink: boolean;
  isSensitive: boolean;
  videoProvider: "bunny_stream" | null;
  providerVideoId: string | null;
  videoPlaybackUrl: string | null;
  videoEmbedUrl: string | null;
  videoThumbnailUrl: string | null;
  videoPreviewUrl: string | null;
  videoDurationSeconds: number | null;
  videoStatus: string | null;
  author: NativeSocialAuthor;
  localStatus?: "pending" | "failed";
};

export type NativeSocialComposerMedia = {
  durationSeconds?: number | null;
  height?: number | null;
  kind: "image" | "video";
  mimeType?: string | null;
  name?: string | null;
  size?: number | null;
  uri: string;
  width?: number | null;
};

export type NativeSocialComment = {
  id: string;
  threadId: string;
  parentCommentId: string | null;
  content: string;
  images: string[];
  createdAt: string;
  updatedAt: string | null;
  userId: string;
  author: NativeSocialAuthor;
  mentions: NativeSocialMentionEntry[];
  supportCount: number;
  viewerSupported: boolean;
  localStatus?: "pending" | "failed";
};

export type NativeSocialShareTarget = {
  avatarUrl: string | null;
  chatId: string;
  label: string;
  lastMessageAt: string | null;
  socialId: string | null;
  subtitle: string | null;
  type: "direct" | "group" | "service";
  userId: string | null;
};

export type NativeSocialFeedPage = {
  rows: NativeSocialThread[];
  hasMore: boolean;
  cursor: NativeSocialFeedCursor | null;
};

type StoredThreadState = {
  saved: string[];
  pinned: string[];
  pinnedAt?: Record<string, string>;
  dbConfirmedAt?: number;
  source?: "cache" | "db";
  status?: "hydrating" | "fresh";
};

export type NativeSocialPostPreference = {
  threadId: string;
  isSaved: boolean;
  isPinned: boolean;
  pinnedAt: string | null;
};

const PAGE_LIMIT = 20;
const SOCIAL_PINS_STORAGE_PREFIX = "huddle_social_pins";
const SOCIAL_SAVES_STORAGE_PREFIX = "huddle_social_saves";
const LINK_PREVIEW_STORAGE_KEY = "noticeboard_link_preview_lru_v1";
const LINK_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_PREVIEW_LRU_LIMIT = 120;
const LINK_PREVIEW_QUEUE_LIMIT = 3;
const LINK_PREVIEW_TIMEOUT_MS = 7000;
const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/i;
const SOCIAL_VIDEO_MAX_SECONDS = 15;

const base64ToUint8Array = (base64: string) => {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const toNumber = (value: unknown, fallback = 0) => {
  const next = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const requireNativeSocialAccessToken = (accessToken?: string | null) => {
  const token = cleanString(accessToken);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const parseJsonSafely = (raw: string): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const nativeSocialRpc = async <T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, requireNativeSocialAccessToken(accessToken));
  if (error) throw error;
  return data as T;
};

const nativeSocialFunctionRequest = async <T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const token = requireNativeSocialAccessToken(accessToken);
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const parsed = parseJsonSafely(raw);
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "message" in parsed
      ? String((parsed as { message?: unknown }).message || response.statusText)
      : response.statusText;
    throw new Error(message || "request_failed");
  }
  return parsed as T;
};

const buildPublicStorageUrl = (bucket: string, path: string) => {
  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
};

export const nativeSocialPinsStorageKey = (userId: string | null | undefined) => `${SOCIAL_PINS_STORAGE_PREFIX}:${userId || "anon"}`;
export const nativeSocialSavesStorageKey = (userId: string | null | undefined) => `${SOCIAL_SAVES_STORAGE_PREFIX}:${userId || "anon"}`;

export const extractNativeSocialFirstHttpUrl = (value: string) => {
  const match = String(value || "").match(URL_PATTERN);
  return match?.[1]?.replace(/[|.,!?;:)\]]+$/g, "") || null;
};

export const stripNativeSocialExternalUrlFromText = (value: string, url: string | null | undefined) => {
  if (!url) return value;
  return String(value || "")
    .replace(url, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const formatNativeSocialUrlLabel = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const compact = `${host}${path}`.replace(/\/+$/, "") || url;
    return compact.length <= 44 ? compact : `${compact.slice(0, 41)}...`;
  } catch {
    return url.length <= 44 ? url : `${url.slice(0, 41)}...`;
  }
};

const parseNativeSocialYouTubeVideoId = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0]?.trim() || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v")?.trim() || null;
      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/").filter(Boolean)[1]?.trim() || null;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const buildNativeSocialIntrinsicLinkPreview = (url: string): NativeSocialLinkPreview | null => {
  const youtubeId = parseNativeSocialYouTubeVideoId(url);
  if (!youtubeId) return null;
  return {
    url,
    title: "YouTube video",
    description: "Shared from YouTube",
    image: `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`,
    siteName: "YouTube",
    loading: false,
    failed: false,
    resolved: true,
  };
};

const buildFallbackLinkPreview = (url: string, error?: string): NativeSocialLinkPreview => {
  const intrinsic = buildNativeSocialIntrinsicLinkPreview(url);
  if (intrinsic) return { ...intrinsic, error };
  return {
    url,
    title: formatNativeSocialUrlLabel(url),
    siteName: (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "External link";
      }
    })(),
    failed: false,
    resolved: true,
    error,
  };
};

const parseMentionEntries = (entries: unknown): NativeSocialMentionEntry[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      start: Number((entry as Record<string, unknown>)?.start ?? 0),
      end: Number((entry as Record<string, unknown>)?.end ?? 0),
      mentionedUserId: String((entry as Record<string, unknown>)?.mentionedUserId || ""),
      socialIdAtTime: String((entry as Record<string, unknown>)?.socialIdAtTime || ""),
    }))
    .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.mentionedUserId && entry.socialIdAtTime)
    .sort((left, right) => left.start - right.start);
};

export const buildNativeSocialCursor = (thread?: NativeSocialThread | null): NativeSocialFeedCursor | null => {
  if (!thread?.createdAt || !thread.id) return null;
  return { created_at: thread.createdAt, id: thread.id, score: thread.score };
};

export const mapNativeSocialFeedRow = (row: Record<string, unknown>): NativeSocialThread => ({
  id: String(row.id || ""),
  title: String(row.title || ""),
  content: String(row.content || ""),
  tags: isStringArray(row.tags) ? row.tags : [],
  hashtags: isStringArray(row.hashtags) ? row.hashtags : [],
  mentions: parseMentionEntries(row.thread_mentions),
  images: isStringArray(row.images) ? row.images.filter((entry) => entry.trim().length > 0) : [],
  likes: toNumber(row.like_count ?? row.likes, 0),
  commentCount: toNumber(row.comment_count, 0),
  shareCount: toNumber(row.share_count ?? row.clicks, 0),
  score: toNumber(row.score, 0),
  mapId: cleanString(row.map_id) || null,
  alertType: cleanString(row.alert_type) || null,
  alertDistrict: cleanString(row.alert_district) || null,
  hasAlertLink: row.has_alert_link === true,
  isSensitive: row.is_sensitive === true,
  videoProvider: row.video_provider === "bunny_stream" ? "bunny_stream" : null,
  providerVideoId: cleanString(row.provider_video_id) || null,
  videoPlaybackUrl: cleanString(row.video_playback_url) || null,
  videoEmbedUrl: cleanString(row.video_embed_url) || null,
  videoThumbnailUrl: cleanString(row.video_thumbnail_url) || null,
  videoPreviewUrl: cleanString(row.video_preview_url) || null,
  videoDurationSeconds: toNumber(row.video_duration_seconds, 0) || null,
  videoStatus: cleanString(row.video_status) || null,
  createdAt: String(row.created_at || new Date().toISOString()),
  updatedAt: cleanString(row.updated_at) || cleanString(row.content_updated_at) || String(row.created_at || new Date().toISOString()),
  userId: String(row.user_id || ""),
  author: {
    displayName: cleanString(row.author_display_name) || null,
    socialId: cleanString(row.author_social_id) || null,
    avatarUrl: cleanString(row.author_avatar_url) || null,
    verificationStatus: cleanString(row.author_verification_status) || null,
    locationCountry: cleanString(row.author_location_country) || null,
    isVerified: isNativeVerifiedProfile(row, "author_is_verified", "author_verification_status"),
    nonSocial: row.author_non_social === true,
  },
});

const resolveNativeSocialAvatarUrl = async (value: unknown) => {
  const raw = cleanString(value);
  if (!raw) return null;
  return resolveNativeProfileImageUrlAsync(raw, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => raw);
};

const resolveNativeSocialThreadAvatarUrls = async (rows: NativeSocialThread[]) => Promise.all(
  rows.map(async (thread) => ({
    ...thread,
    author: {
      ...thread.author,
      avatarUrl: await resolveNativeSocialAvatarUrl(thread.author.avatarUrl),
    },
  })),
);

export async function hydrateNativeSocialRows(rows: NativeSocialThread[], accessToken?: string | null): Promise<NativeSocialThread[]> {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return rows;
  if (!accessToken) throw new Error("missing_access_token");

  const { data, error } = await nativeExactTokenRpc("get_social_feed_hydration", { p_thread_ids: ids }, accessToken);

  if (error || !Array.isArray(data)) {
    throw new Error(error?.message || "Social feed hydration is unavailable.");
  }
  const byThreadId = new Map(
    (data as Array<Record<string, unknown>>)
      .filter((row) => typeof row.thread_id === "string" && row.thread_id)
      .map((row) => [String(row.thread_id), row]),
  );

  const hydrated = rows.map((thread) => {
    const hydration = byThreadId.get(thread.id);
    if (!hydration) return thread;
    return {
      ...thread,
      shareCount: toNumber(hydration.share_count, thread.shareCount),
      mentions: parseMentionEntries(hydration.thread_mentions),
      isSensitive: hydration.is_sensitive === true,
      mapId: cleanString(hydration.map_id) || thread.mapId,
      alertType: cleanString(hydration.alert_type) || thread.alertType,
      alertDistrict: cleanString(hydration.alert_district) || thread.alertDistrict,
      hasAlertLink: hydration.has_alert_link === true || thread.hasAlertLink,
      videoProvider: hydration.video_provider === "bunny_stream" ? "bunny_stream" : thread.videoProvider,
      providerVideoId: cleanString(hydration.provider_video_id) || thread.providerVideoId,
      videoPlaybackUrl: cleanString(hydration.video_playback_url) || thread.videoPlaybackUrl,
      videoEmbedUrl: cleanString(hydration.video_embed_url) || thread.videoEmbedUrl,
      videoThumbnailUrl: cleanString(hydration.video_thumbnail_url) || thread.videoThumbnailUrl,
      videoPreviewUrl: cleanString(hydration.video_preview_url) || thread.videoPreviewUrl,
      videoDurationSeconds: toNumber(hydration.video_duration_seconds, thread.videoDurationSeconds ?? 0) || thread.videoDurationSeconds,
      videoStatus: cleanString(hydration.video_status) || thread.videoStatus,
      author: {
        ...thread.author,
        displayName: cleanString(hydration.author_display_name) || thread.author.displayName,
        socialId: cleanString(hydration.author_social_id) || thread.author.socialId,
        avatarUrl: cleanString(hydration.author_avatar_url) || thread.author.avatarUrl,
        verificationStatus: cleanString(hydration.author_verification_status) || thread.author.verificationStatus,
        locationCountry: cleanString(hydration.author_location_country) || thread.author.locationCountry,
        isVerified: isNativeVerifiedProfile(hydration, "author_is_verified", "author_verification_status") || thread.author.isVerified,
      },
    };
  });

  return resolveNativeSocialThreadAvatarUrls(hydrated);
}

export async function fetchNativeSocialFeedPage(options: {
  viewerId: string;
  accessToken?: string | null;
  sortMode: NativeSocialSortMode;
  cursor?: NativeSocialFeedCursor | null;
  viewerScope?: NativeViewerScope | null;
}): Promise<NativeSocialFeedPage> {
  const scopePoint = options.viewerScope?.primaryPoint ?? null;
  const params = {
    p_viewer_id: options.viewerId,
    p_sort: options.sortMode === "Saves" ? "Latest" : options.sortMode,
    p_limit: PAGE_LIMIT,
    p_cursor: options.cursor ?? null,
    p_viewer_scope: options.viewerScope ? {
      adminArea: options.viewerScope.adminArea ?? null,
      city: options.viewerScope.city ?? null,
      country: options.viewerScope.country ?? null,
      countryCode: options.viewerScope.countryCode ?? null,
      countryName: options.viewerScope.countryName ?? null,
      district: options.viewerScope.district ?? null,
      lat: scopePoint?.lat ?? null,
      lng: scopePoint?.lng ?? null,
      source: options.viewerScope.source,
      sourceConsistent: options.viewerScope.sourceConsistent,
    } : null,
  };
  if (!options.accessToken) throw new Error("missing_access_token");
  const { data, error } = await nativeExactTokenRpc("get_social_feed", params, options.accessToken);
  if (error) throw error;
  const baseRows = (Array.isArray(data) ? data : []).map((row) => mapNativeSocialFeedRow(row as Record<string, unknown>));
  const rows = await hydrateNativeSocialRows(baseRows, options.accessToken).catch((error) => {
    if (__DEV__) console.warn("NATIVE_SOCIAL_HYDRATION_NON_FATAL", { message: String((error as { message?: unknown })?.message || error) });
    return resolveNativeSocialThreadAvatarUrls(baseRows);
  });
  return {
    rows,
    hasMore: baseRows.length === PAGE_LIMIT,
    cursor: buildNativeSocialCursor(rows[rows.length - 1] ?? baseRows[baseRows.length - 1]),
  };
}

export async function fetchNativeSocialThreadById(threadId: string, accessToken?: string | null): Promise<NativeSocialThread | null> {
  if (!threadId) return null;
  if (!accessToken) throw new Error("missing_access_token");
  const { data, error } = await nativeExactTokenRpc("get_native_social_thread_by_id", { p_thread_id: threadId }, accessToken);
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const baseRow = mapNativeSocialFeedRow(row as Record<string, unknown>);
  const [hydrated] = await hydrateNativeSocialRows([baseRow], accessToken).catch(() => resolveNativeSocialThreadAvatarUrls([baseRow]));
  return hydrated || null;
}

export async function loadNativeBlockedSocialUserIds(userId: string, accessToken?: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  if (!accessToken) throw new Error("missing_access_token");
  const { data, error } = await nativeExactTokenRpc<Array<{ user_id?: string | null }>>(
    "get_native_social_blocked_user_ids",
    {},
    accessToken,
  );
  if (error || !Array.isArray(data)) {
    throw new Error(error?.message || "social_blocked_users_unavailable");
  }
  const ids = new Set<string>();
  for (const row of data) {
    const blockedUserId = String(row.user_id || "").trim();
    if (blockedUserId && blockedUserId !== userId) ids.add(blockedUserId);
  }
  return ids;
}

export async function areNativeSocialUsersBlocked(userId: string, targetUserId: string, accessToken?: string | null) {
  if (!userId || !targetUserId) return false;
  const data = await nativeSocialRpc<{ blocked?: boolean } | boolean>(
    "get_native_social_block_relationship",
    { p_target_user_id: targetUserId },
    accessToken,
  );
  return data === true || (typeof data === "object" && data !== null && data.blocked === true);
}

const socialSupportedThreadsCacheKey = (userId: string) => `native-social-supported-threads:v1:${userId}`;
const socialSupportedThreadsMemoryCache = new Map<string, Set<string>>();
const socialSupportedThreadsInFlight = new Map<string, Promise<Set<string>>>();

const readSocialSupportedThreadsCache = async (userId: string): Promise<Set<string> | null> => {
  const memory = socialSupportedThreadsMemoryCache.get(userId);
  if (memory) return new Set(memory);
  try {
    const raw = await AsyncStorage.getItem(socialSupportedThreadsCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const set = new Set(parsed.map(String).filter(Boolean));
    socialSupportedThreadsMemoryCache.set(userId, set);
    return new Set(set);
  } catch {
    return null;
  }
};

const writeSocialSupportedThreadsCache = async (userId: string, values: Set<string>) => {
  socialSupportedThreadsMemoryCache.set(userId, new Set(values));
  try {
    await AsyncStorage.setItem(socialSupportedThreadsCacheKey(userId), JSON.stringify(Array.from(values)));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export async function loadNativeSupportedSocialThreadIds(userId: string, threadIds: string[], accessToken?: string | null): Promise<Set<string>> {
  if (!userId || threadIds.length === 0) return new Set();
  if (!accessToken) throw new Error("missing_access_token");
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const cached = await readSocialSupportedThreadsCache(userId);
  if (cached) return new Set(ids.filter((id) => cached.has(id)));

  const existing = socialSupportedThreadsInFlight.get(userId);
  if (existing) {
    const supported = await existing;
    return new Set(ids.filter((id) => supported.has(id)));
  }

  const request = (async () => {
    const { data, error } = await nativeExactTokenRpc<Array<{ thread_id?: string | null }>>(
      "get_native_social_supported_thread_ids",
      { p_thread_ids: ids },
      accessToken,
    );

    if (error || !Array.isArray(data)) {
      throw new Error(error?.message || "social_supported_threads_unavailable");
    }
    const supported = new Set(
      (data as Array<{ thread_id?: string | null }>)
        .map((row) => row.thread_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    await writeSocialSupportedThreadsCache(userId, supported);
    return supported;
  })().finally(() => {
    if (socialSupportedThreadsInFlight.get(userId) === request) socialSupportedThreadsInFlight.delete(userId);
  });

  socialSupportedThreadsInFlight.set(userId, request);
  const supported = await request;
  return new Set(ids.filter((id) => supported.has(id)));
}

const mapNativeSocialCommentRow = (row: Record<string, unknown>, fallbackThreadId = ""): NativeSocialComment => ({
  id: String(row.id || ""),
  threadId: String(row.thread_id || fallbackThreadId),
  parentCommentId: cleanString(row.parent_comment_id) || null,
  content: String(row.content || ""),
  images: isStringArray(row.images) ? row.images : [],
  createdAt: String(row.created_at || new Date().toISOString()),
  updatedAt: cleanString(row.updated_at) || String(row.created_at || new Date().toISOString()),
  userId: String(row.user_id || ""),
  author: {
    displayName: cleanString(row.author_display_name) || null,
    socialId: cleanString(row.author_social_id) || null,
    avatarUrl: cleanString(row.author_avatar_url) || null,
    verificationStatus: cleanString(row.author_verification_status) || null,
    locationCountry: cleanString(row.author_location_country) || null,
    isVerified: isNativeVerifiedProfile(row, "author_is_verified", "author_verification_status"),
    nonSocial: false,
  },
  mentions: parseMentionEntries(row.reply_mentions),
  supportCount: Number(row.support_count ?? 0),
  viewerSupported: row.viewer_supported === true,
});

export async function fetchNativeSocialComments(threadId: string, options: { accessToken?: string | null; beforeCreatedAt?: string | null; limit?: number } = {}): Promise<NativeSocialComment[]> {
  if (!threadId) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const data = await nativeSocialRpc<Array<Record<string, unknown>>>(
    "get_native_social_comments",
    { p_thread_id: threadId, p_before_created_at: options.beforeCreatedAt ?? null, p_limit: limit },
    options.accessToken,
  );
  const comments = (Array.isArray(data) ? data : []).map((row) => mapNativeSocialCommentRow(row, threadId));
  return Promise.all(comments.map(async (comment) => ({
    ...comment,
    author: {
      ...comment.author,
      avatarUrl: await resolveNativeSocialAvatarUrl(comment.author.avatarUrl),
    },
  })));
}

export async function uploadNativeSocialImage(userId: string, media: NativeSocialComposerMedia, scope: "thread" | "reply" | "report" | "review", accessToken?: string | null): Promise<string> {
  const token = requireNativeSocialAccessToken(accessToken);
  const info = await FileSystem.getInfoAsync(media.uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const ext = (media.name?.split(".").pop() || media.mimeType?.split("/").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${userId}/${scope}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(media.uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToUint8Array(base64);
  if (body.byteLength === 0) throw new Error("Selected image is empty.");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/notices/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "cache-control": "3600",
      "content-type": media.mimeType || "image/jpeg",
      "x-upsert": "false",
    },
    body,
  });
  if (!response.ok) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      originalError: new Error(`Image upload failed (${response.status}).`),
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  }
  try {
    await registerNativeMediaAsset({
      accessToken: token,
      bucket: "notices",
      contentType: scope === "reply" ? "social_comment" : scope === "report" ? "user_report" : scope === "review" ? "service_review" : "social_thread",
      objectPath: path,
    });
  } catch (error) {
    const cleanupResult = await requestNativeStorageCleanupResult("notices", path, "register_social_media_failed", token);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  if (__DEV__) {
    console.log("STORAGE_URL_GET_PUBLIC", { bucket: "notices", path });
  }
  return buildPublicStorageUrl("notices", path);
}

type NoticeStorageRef = {
  bucket: "notices" | "social_album";
  path: string;
};

const extractNoticeStorageRef = (mediaUrl: string): NoticeStorageRef | null => {
  try {
    const parsed = new URL(mediaUrl);
    const decodeSafe = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const path = decodeSafe(parsed.pathname || "");
    const markers: Array<{ bucket: "notices" | "social_album"; marker: string }> = [
      { bucket: "notices", marker: "/storage/v1/object/public/notices/" },
      { bucket: "social_album", marker: "/storage/v1/object/public/social_album/" },
      { bucket: "social_album", marker: "/storage/v1/object/public/social-album/" },
      { bucket: "notices", marker: "/storage/v1/object/notices/" },
      { bucket: "social_album", marker: "/storage/v1/object/social_album/" },
      { bucket: "social_album", marker: "/storage/v1/object/social-album/" },
    ];
    for (const { bucket, marker } of markers) {
      const markerIndex = path.indexOf(marker);
      if (markerIndex >= 0) {
        const objectPath = path.slice(markerIndex + marker.length).replace(/^\/+/, "");
        return objectPath ? { bucket, path: objectPath } : null;
      }
    }
    const fallback = path.split("/notices/").pop() || path.split("/social_album/").pop() || path.split("/social-album/").pop();
    if (!fallback) return null;
    const normalized = decodeSafe(fallback.replace(/^\/+/, ""));
    if (!normalized) return null;
    return { bucket: "notices", path: normalized };
  } catch {
    const fallback = mediaUrl.split("?")[0].split("/notices/").pop() || mediaUrl.split("?")[0].split("/social_album/").pop() || mediaUrl.split("?")[0].split("/social-album/").pop();
    if (!fallback || fallback.length === 0) return null;
    const decodeSafe = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const normalized = decodeSafe(fallback.replace(/^\/+/, ""));
    if (!normalized) return null;
    const isSocialAlbum = mediaUrl.includes("/social_album/") || mediaUrl.includes("/social-album/");
    return { bucket: isSocialAlbum ? "social_album" : "notices", path: normalized };
  }
};

const normalizeNoticeImageUrl = (url: string) => {
  const trimmed = typeof url === "string" ? url.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

const makeNoticeStorageIdentity = (mediaUrl: string) => {
  const normalizedUrl = normalizeNoticeImageUrl(mediaUrl);
  if (!normalizedUrl) return null;
  const ref = extractNoticeStorageRef(normalizedUrl);
  if (!ref?.path) return null;
  const bucket = ref.bucket === "social_album" ? "social_album" : "notices";
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const normalizedPath = safeDecode(ref.path).replace(/^\/+/, "");
  return `${bucket}|${normalizedPath}`;
};

export const cleanupNativeSocialStorageImages = async (
  urls: string[],
  ownerUserId?: string | null,
  accessToken?: string | null,
  reason = "delete_social_thread",
) : Promise<NativeProtectedActionCleanupResult> => {
  const token = requireNativeSocialAccessToken(accessToken);
  const ownerPrefix = String(ownerUserId || "").trim();
  if (!ownerPrefix) return "not_needed";
  const refs = urls
    .map((mediaUrl) => extractNoticeStorageRef(mediaUrl))
    .filter((entry): entry is NoticeStorageRef => !!entry && Boolean(entry.path) && entry.path.startsWith(`${ownerPrefix}/`));
  if (refs.length === 0) return "not_needed";
  const uniqueRefs = Array.from(new Map(refs.map((entry) => [`${entry.bucket}:${entry.path}`, entry])).values());
  let cleanupResult: NativeProtectedActionCleanupResult = "not_needed";
  for (const entry of uniqueRefs) {
    const nextResult = await requestNativeStorageCleanupResult(entry.bucket, entry.path, reason, token);
    if (nextResult === "failed") cleanupResult = "failed";
    else if (nextResult === "queued" && cleanupResult !== "failed") cleanupResult = "queued";
  }
  return cleanupResult;
};

const computeRemovedNoticeImageUrls = (previousImages: string[] | undefined, nextImages: string[] | undefined) => {
  if (!previousImages || previousImages.length === 0) return [];
  const normalizedPrevious = previousImages
    .map((url) => {
      const normalized = normalizeNoticeImageUrl(url);
      if (!normalized) return null;
      const key = makeNoticeStorageIdentity(normalized);
      return { key: key || `raw|${normalized}`, original: normalized };
    })
    .filter((entry): entry is { key: string; original: string } => entry !== null);
  if (!nextImages || nextImages.length === 0) return normalizedPrevious.map((entry) => entry.original);
  const nextKeys = new Set(
    nextImages
      .map((url) => {
        const normalized = normalizeNoticeImageUrl(url);
        if (!normalized) return null;
        return makeNoticeStorageIdentity(normalized) || `raw|${normalized}`;
      })
      .filter((entry): entry is string => Boolean(entry)),
  );
  return normalizedPrevious
    .filter((entry) => !nextKeys.has(entry.key))
    .map((entry) => entry.original);
};

export async function createNativeSocialVideoUpload(userId: string, media: NativeSocialComposerMedia, title: string, accessToken?: string | null) {
  requireNativeSocialAccessToken(accessToken);
  if (Number(media.durationSeconds ?? 0) > SOCIAL_VIDEO_MAX_SECONDS + 0.5) {
    throw new Error("Video must be trimmed to 15 seconds before upload.");
  }
  const fileInfo = await FileSystem.getInfoAsync(media.uri);
  if (!fileInfo.exists) throw new Error("Selected video is unavailable.");
  const tus = await import("tus-js-client");
  const response = await fetch(media.uri);
  const blob = await response.blob();
  const durationSeconds = Math.max(1, Math.min(SOCIAL_VIDEO_MAX_SECONDS, Number(media.durationSeconds ?? SOCIAL_VIDEO_MAX_SECONDS)));
  const createData = await nativeSocialFunctionRequest<{
    videoId: string;
    libraryId: string;
    expirationTime: number;
    signature: string;
    tusEndpoint: string;
    collectionId?: string | null;
    playbackUrl: string;
    embedUrl: string;
    thumbnailUrl?: string | null;
    previewUrl?: string | null;
  }>("social-video-create-upload", {
    title: title || "Social video",
    durationSeconds,
    fileName: media.name || "social-video.mp4",
    fileType: media.mimeType || "video/mp4",
    fileSize: Number(media.size || blob.size || 0),
  }, accessToken);
  if (!createData?.videoId) throw new Error("Video upload authorization failed.");

  await new Promise<void>((resolve, reject) => {
    const TusUpload = tus.Upload;
    const videoUpload = new TusUpload(blob, {
      endpoint: createData.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: createData.signature,
        AuthorizationExpire: String(createData.expirationTime),
        LibraryId: String(createData.libraryId),
        VideoId: createData.videoId,
      },
      metadata: {
        filetype: media.mimeType || "video/mp4",
        title: title || media.name || "Social video",
        ...(createData.collectionId ? { collection: createData.collectionId } : {}),
      },
      onError: reject,
      onSuccess: () => resolve(),
    });
    videoUpload.start();
  });

  const finalizeData = await nativeSocialFunctionRequest<Record<string, unknown>>(
    "social-video-finalize",
    { videoId: createData.videoId, durationSeconds },
    accessToken,
  );
  return {
    provider: "bunny_stream",
    providerVideoId: String(finalizeData?.providerVideoId || createData.videoId),
    playbackUrl: String(finalizeData?.playbackUrl || createData.playbackUrl || ""),
    embedUrl: String(finalizeData?.embedUrl || createData.embedUrl || ""),
    thumbnailUrl: cleanString(finalizeData?.thumbnailUrl) || createData.thumbnailUrl || null,
    previewUrl: cleanString(finalizeData?.previewUrl) || createData.previewUrl || null,
    duration: Number(finalizeData?.duration ?? durationSeconds),
    status: cleanString(finalizeData?.status) || "uploaded",
  };
}

export async function deleteNativeSocialVideo(providerVideoId: string, accessToken?: string | null) {
  if (!providerVideoId) return;
  await nativeSocialFunctionRequest("social-video-delete", { videoId: providerVideoId }, accessToken);
}

export async function createNativeSocialThread(args: {
  accessToken?: string | null;
  category: string;
  content: string;
  images: string[];
  isSensitive: boolean;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
}) {
  const data = await nativeSocialRpc<{ id?: string | null } | string>("create_native_social_thread", {
    p_title: args.title,
    p_content: args.content,
    p_category: args.category || "Social",
    p_images: args.images,
    p_is_sensitive: args.isSensitive,
    p_video: args.video ?? null,
  }, args.accessToken);
  return typeof data === "string" ? data : String(data?.id || "");
}

export async function updateNativeSocialThread(args: {
  accessToken?: string | null;
  category: string;
  content: string;
  id: string;
  images?: string[];
  isSensitive: boolean;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
  previousImages?: string[];
}) {
  const nextImages = Array.isArray(args.images) ? args.images.map((url) => normalizeNoticeImageUrl(url)).filter((url): url is string => Boolean(url)) : undefined;
  const removedImageUrls = computeRemovedNoticeImageUrls(args.previousImages, nextImages);
  const data = await nativeSocialRpc<{ id?: string | null } | string>("update_native_social_thread", {
    p_thread_id: args.id,
    p_title: args.title,
    p_content: args.content,
    p_category: args.category || "Social",
    p_images: nextImages ?? null,
    p_is_sensitive: args.isSensitive,
    p_video: args.video ?? null,
  }, args.accessToken);
  const updatedId = typeof data === "string" ? data : data?.id;
  if (!updatedId) throw new Error("Unable to update post.");
  if (removedImageUrls.length > 0) {
    await cleanupNativeSocialStorageImages(removedImageUrls, args.userId, args.accessToken, "update_social_thread_removed_media");
  }
}

export async function deleteNativeSocialThread(thread: NativeSocialThread, userId: string, accessToken?: string | null): Promise<boolean> {
  if (!thread.id || !userId) return false;
  const data = await nativeSocialRpc<unknown>("delete_social_thread", { p_thread_id: thread.id }, accessToken);
  const deleted = data === true || (typeof data === "object" && data !== null && (data as { deleted?: boolean }).deleted === true);
  if (deleted && thread.images.length > 0) {
    await cleanupNativeSocialStorageImages(thread.images, userId, accessToken, "delete_social_thread");
  }
  if (thread.providerVideoId) {
    void deleteNativeSocialVideo(thread.providerVideoId, accessToken).catch((videoError) => {
      console.error("[social.delete_thread_video.failed]", {
        threadId: thread.id,
        error: videoError instanceof Error ? videoError.message : String(videoError),
      });
    });
  }
  return deleted;
}

export async function createNativeSocialComment(args: {
  accessToken?: string | null;
  content: string;
  images: string[];
  parentCommentId?: string | null;
  threadId: string;
  userId: string;
}) {
  const data = await nativeSocialRpc<{ id?: string | null } | string>("create_native_social_comment", {
    p_thread_id: args.threadId,
    p_parent_comment_id: args.parentCommentId || null,
    p_content: args.content,
    p_images: args.images,
  }, args.accessToken);
  return typeof data === "string" ? data : String(data?.id || "");
}

export async function persistNativeSocialReplyMentions(
  replyId: string,
  mentions: NativeSocialMentionEntry[],
  accessToken?: string | null,
) {
  if (!replyId || mentions.length === 0) return;
  await nativeSocialRpc("replace_native_social_reply_mentions", {
    p_reply_id: replyId,
    p_mentions: mentions,
  }, accessToken);
}

export async function replaceNativeSocialReplyMentions(
  replyId: string,
  mentions: NativeSocialMentionEntry[],
  accessToken?: string | null,
) {
  if (!replyId) return;
  await nativeSocialRpc("replace_native_social_reply_mentions", {
    p_reply_id: replyId,
    p_mentions: mentions,
  }, accessToken);
}

export async function persistNativeSocialPostMentions(
  postId: string,
  mentions: NativeSocialMentionEntry[],
  accessToken?: string | null,
) {
  if (!postId) return;
  await nativeSocialRpc("replace_native_social_post_mentions", {
    p_post_id: postId,
    p_mentions: mentions,
  }, accessToken);
}

export async function resolveNativeSocialMentionsFromText(value: string, accessToken?: string | null): Promise<NativeSocialMentionEntry[]> {
  const matches = Array.from(value.matchAll(/(^|[\s(])@([a-zA-Z0-9._]{2,30})/g));
  const tokens = Array.from(new Set(matches.map((match) => String(match[2] || "").toLowerCase()).filter(Boolean)));
  if (tokens.length === 0) return [];
  const data = await nativeSocialRpc<Array<{ id?: string | null; social_id?: string | null }>>(
    "resolve_native_social_mentions",
    { p_social_ids: tokens },
    accessToken,
  );
  if (!Array.isArray(data)) return [];

  const profileBySocialId = new Map(
    (data as Array<{ id?: string | null; social_id?: string | null }>)
      .map((row) => [String(row.social_id || "").toLowerCase(), String(row.id || "")] as const)
      .filter(([socialId, id]) => Boolean(socialId && id)),
  );

  const entries: NativeSocialMentionEntry[] = [];
  matches.forEach((match) => {
    const socialId = String(match[2] || "").toLowerCase();
    const mentionedUserId = profileBySocialId.get(socialId);
    if (!mentionedUserId || typeof match.index !== "number") return;
    const prefixLength = String(match[1] || "").length;
    const start = match.index + prefixLength;
    const end = start + socialId.length + 1;
    entries.push({ start, end, mentionedUserId, socialIdAtTime: socialId });
  });
  return entries.sort((left, right) => left.start - right.start);
}

export async function searchNativeSocialMentionSuggestions(query: string, excludeUserId?: string | null, accessToken?: string | null): Promise<NativeSocialMentionSuggestion[]> {
  const normalized = query.trim().replace(/^@/, "").toLowerCase();
  if (normalized.length > 24) return [];
  const safeQuery = normalized.replace(/[%_]/g, "");
  const excludedId = String(excludeUserId || "").trim();
  const rows = await nativeSocialRpc<Array<Record<string, unknown>>>(
    "search_native_social_mentions",
    { p_query: safeQuery, p_exclude_user_id: excludedId || null, p_limit: 10 },
    accessToken,
  );
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      userId: String(row.id || ""),
      socialId: String(row.social_id || "").trim(),
      displayName: cleanString(row.display_name) || null,
      avatarUrl: cleanString(row.avatar_url) || null,
    }))
    .filter((entry) => {
      if (!entry.userId || !entry.socialId || seen.has(entry.userId)) return false;
      seen.add(entry.userId);
      return true;
    })
    .slice(0, 10);
}

export async function createNativeSocialMentionNotifications(threadId: string, actorId: string, mentionedUserIds: string[], accessToken?: string | null) {
  const uniqueIds = Array.from(new Set(mentionedUserIds.filter(Boolean)));
  if (!threadId || !actorId || uniqueIds.length === 0) return;
  await nativeSocialRpc("create_thread_mention_notifications", {
    p_actor_id: actorId,
    p_thread_id: threadId,
    p_recipient_ids: uniqueIds,
  }, accessToken);
}

export async function upsertNativeSocialNotificationWindow(args: {
  actorId: string;
  actorName: string;
  category: "social";
  href: string;
  kind: "comment" | "like" | "reply";
  ownerUserId: string;
  subjectId: string;
  subjectType: "comment" | "thread";
  accessToken?: string | null;
}) {
  if (!args.ownerUserId || !args.subjectId || !args.actorId) return;
  await nativeSocialRpc("upsert_notification_window", {
    p_actor_id: args.actorId,
    p_actor_name: args.actorName,
    p_category: args.category,
    p_href: args.href,
    p_kind: args.kind,
    p_owner_user_id: args.ownerUserId,
    p_subject_id: args.subjectId,
    p_subject_type: args.subjectType,
  }, args.accessToken);
}

export async function updateNativeSocialComment(commentId: string, userId: string, content: string, accessToken?: string | null) {
  if (!commentId || !userId) throw new Error("Reply is unavailable.");
  await nativeSocialRpc("update_native_social_comment", { p_comment_id: commentId, p_content: content }, accessToken);
}

export async function deleteNativeSocialComment(commentId: string, userId: string, accessToken?: string | null) {
  if (!commentId || !userId) throw new Error("Reply is unavailable.");
  await nativeSocialRpc("delete_native_social_comment", { p_comment_id: commentId }, accessToken);
}

export async function updateNativeSupportedSocialThreadCache(userId: string, threadId: string, supported: boolean) {
  if (!userId || !threadId) return;
  const cached = await readSocialSupportedThreadsCache(userId) ?? new Set<string>();
  if (supported) cached.add(threadId);
  else cached.delete(threadId);
  await writeSocialSupportedThreadsCache(userId, cached);
}

export async function setNativeSocialSupport(thread: NativeSocialThread, userId: string, supported: boolean, accessToken?: string | null) {
  if (__DEV__) console.log("NATIVE_SOCIAL_SUPPORT_RPC_START", {
    hasAccessToken: Boolean(accessToken),
    supportedBefore: supported,
    threadId: thread.id,
  });
  let data: { support_count?: number | null } | number;
  try {
    data = await nativeSocialRpc<{ support_count?: number | null } | number>("set_native_social_support", {
      p_thread_id: thread.id,
      p_supported_before: supported,
    }, accessToken);
    if (__DEV__) console.log("NATIVE_SOCIAL_SUPPORT_RPC_RESULT", {
      isArray: Array.isArray(data),
      rawDataShape: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
      supportCount: typeof data === "number" ? data : Number(data?.support_count ?? 0),
      threadId: thread.id,
    });
  } catch (error) {
    if (__DEV__) console.warn("NATIVE_SOCIAL_SUPPORT_RPC_ERROR", {
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : null,
      message: error instanceof Error ? error.message : String(error),
      threadId: thread.id,
    });
    throw error;
  }
  const cached = await readSocialSupportedThreadsCache(userId) ?? new Set<string>();
  if (supported) cached.delete(thread.id);
  else cached.add(thread.id);
  await writeSocialSupportedThreadsCache(userId, cached);
  return typeof data === "number" ? data : Number(data?.support_count ?? 0);
}

export async function setNativeSocialCommentSupport(commentId: string, supported: boolean, accessToken?: string | null) {
  if (!commentId) throw new Error("Comment is unavailable.");
  if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_SUPPORT_RPC_START", {
    commentId,
    hasAccessToken: Boolean(accessToken),
    nextSupported: supported,
  });
  let data: { support_count?: number | null; supported?: boolean | null } | Array<{ support_count?: number | null; supported?: boolean | null }>;
  try {
    data = await nativeSocialRpc<
      { support_count?: number | null; supported?: boolean | null } | Array<{ support_count?: number | null; supported?: boolean | null }>
    >("set_native_social_comment_support", {
      p_comment_id: commentId,
      p_supported: supported,
    }, accessToken);
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_SUPPORT_RPC_RESULT", {
      commentId,
      isArray: Array.isArray(data),
      rawDataShape: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
    });
  } catch (error) {
    if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_SUPPORT_RPC_ERROR", {
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : null,
      commentId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    supportCount: Number(row?.support_count ?? 0),
    supported: row?.supported === true,
  };
}

export async function blockNativeSocialUser(authorId: string, accessToken?: string | null) {
  await nativeSocialRpc("block_user", { p_blocked_id: authorId }, accessToken);
}

export const purgeNativeSocialPersistentCache = async (userId: string, options?: { commentsOnlyForThreadId?: string | null }) => {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefixes = [
      `native-social-feed:v4:${cleanUserId}:`,
      `native-social-comments:v4:${cleanUserId}:`,
      `native-social-feed:v3:${cleanUserId}:`,
      `native-social-comments:v3:${cleanUserId}:`,
    ];
    const removals = keys.filter((key) => {
      if (options?.commentsOnlyForThreadId) {
        return key.startsWith(`native-social-comments:v3:${cleanUserId}:${options.commentsOnlyForThreadId}:`) ||
          (key.startsWith(`native-social-comments:v4:${cleanUserId}:`) && key.includes(`:${options.commentsOnlyForThreadId}:`));
      }
      return prefixes.some((prefix) => key.startsWith(prefix));
    });
    if (removals.length > 0) await AsyncStorage.multiRemove(removals);
  } catch {
    // Cache purge is best-effort; server filtering remains authoritative.
  }
};

export async function reportNativeSocialUser(args: {
  chatRoomId?: string | null;
  categories: string[];
  details: string | null;
  other?: string;
  reporterId: string;
  source?: "Social" | "Chat" | "Group Chat" | "Map";
  sourceOrigin?: "social" | "friends chats" | "maps" | "other";
  targetUserId: string;
  targetName?: string | null;
  attachmentUrls?: string[];
  accessToken?: string | null;
}) {
  const data = await nativeSocialRpc<unknown>("process_user_report", {
    p_target_id: args.targetUserId,
    p_categories: args.categories,
    p_details: args.details,
    p_attachment_urls: args.attachmentUrls ?? [],
    p_source: args.sourceOrigin ?? "social",
  }, args.accessToken);
  const reportId = (() => {
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    const value = row.report_id ?? row.id ?? null;
    return typeof value === "string" && value.trim() ? value : null;
  })();
  if (args.chatRoomId && args.sourceOrigin === "friends chats") {
    await nativeSocialRpc("freeze_chat_for_report", {
      p_chat_id: args.chatRoomId,
      p_report_id: reportId,
      p_reported_message_id: null,
    }, args.accessToken);
  }
  void nativeSocialFunctionRequest("support-request", {
      userId: args.reporterId,
      subject: `Report: ${args.targetName || args.targetUserId}`,
      message: JSON.stringify({
        target_user_id: args.targetUserId,
        categories: args.categories,
        other: args.other || "",
        details: args.details || "",
        attachments: args.attachmentUrls ?? [],
      }),
      source: args.source ?? "Social",
  }, args.accessToken).catch(() => undefined);
}

export async function recordNativeSocialShare(threadId: string, accessToken?: string | null): Promise<number | null> {
  try {
    const data = await nativeSocialRpc<unknown>("record_thread_share_click", { p_thread_id: threadId }, accessToken);
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

export async function fetchNativeSocialShareTargets(userId: string, accessToken?: string | null): Promise<NativeSocialShareTarget[]> {
  if (!userId) return [];
  const data = await nativeSocialRpc<unknown>("get_share_targets", {}, accessToken);
  return (Array.isArray(data) ? data : []).map((row) => {
    const item = row as Record<string, unknown>;
    const roomType = cleanString(item.room_type).toLowerCase();
    const peerUserId = cleanString(item.user_id) || cleanString(item.peer_user_id) || null;
    return {
      avatarUrl: cleanString(item.avatar) || cleanString(item.avatar_url) || null,
      chatId: cleanString(item.chat_id),
      label: cleanString(item.name) || "Conversation",
      lastMessageAt: cleanString(item.last_message_at) || null,
      socialId: cleanString(item.social_id).replace(/^@+/, "") || null,
      subtitle: roomType === "group" ? "Group chat" : roomType === "service" ? "Care" : cleanString(item.social_id) ? `@${cleanString(item.social_id).replace(/^@+/, "")}` : "Chat",
      type: roomType === "group" ? "group" : roomType === "service" ? "service" : "direct",
      userId: roomType === "group" ? null : peerUserId,
    } satisfies NativeSocialShareTarget;
  }).filter((target) => target.chatId);
}

export function buildNativeSocialSharePayload(thread: NativeSocialThread) {
  return buildShareModel({
    origin: "https://huddle.pet",
    contentType: "thread",
    contentId: thread.id,
    surface: "Social",
    displayName: thread.author.displayName,
    socialId: thread.author.socialId,
    contentSnippet: thread.content,
    imagePath: thread.images[0] || "/huddle-logo.jpg",
    nativeShareText: thread.title || "See this post on huddle.",
  });
}

export function buildNativeMapAlertSharePayload(alert: {
  creator?: { display_name?: string | null; social_id?: string | null } | null;
  description?: string | null;
  id: string;
  media_urls?: string[] | null;
  photo_url?: string | null;
  title?: string | null;
}) {
  const firstAlertImage = (
    Array.isArray(alert.media_urls)
      ? alert.media_urls.find((entry) => typeof entry === "string" && entry.trim().length > 0)
      : null
  ) || (alert.photo_url ? String(alert.photo_url).trim() : null);
  return buildShareModel({
    origin: "https://huddle.pet",
    contentType: "alert",
    contentId: alert.id,
    surface: "Map",
    appContentId: alert.id,
    displayName: alert.creator?.display_name ?? null,
    socialId: alert.creator?.social_id ?? null,
    contentSnippet: alert.description || alert.title || null,
    imagePath: firstAlertImage || "/huddle-logo.jpg",
    nativeShareText: alert.title || "See this alert to help look out for the pet community!",
  });
}

export async function sendNativeSocialShareToChat(thread: NativeSocialThread, target: NativeSocialShareTarget, userId: string, accessToken?: string | null) {
  if (!userId || !target.chatId) throw new Error("Share target is unavailable.");
  await nativeSocialRpc("send_native_social_share_to_chat", {
    p_chat_id: target.chatId,
    p_content: serializeChatShareMessage(buildNativeSocialSharePayload(thread)),
  }, accessToken);
}

export async function sendNativeMapAlertShareToChat(alert: Parameters<typeof buildNativeMapAlertSharePayload>[0], target: NativeSocialShareTarget, userId: string, accessToken?: string | null) {
  if (!userId || !target.chatId) throw new Error("Share target is unavailable.");
  await nativeSocialRpc("send_native_social_share_to_chat", {
    p_chat_id: target.chatId,
    p_content: serializeChatShareMessage(buildNativeMapAlertSharePayload(alert)),
  }, accessToken);
}


export async function recordNativeSocialFeedEvent({
  eventType,
  metadata,
  sessionId,
  threadId,
  userId,
  accessToken,
}: {
  accessToken?: string | null;
  eventType: NativeSocialFeedEventType;
  metadata?: Record<string, unknown>;
  sessionId: string;
  threadId: string;
  userId: string | null | undefined;
}) {
  if (!userId || !threadId || !sessionId) return false;
  if (eventType === "impression" || eventType === "dwell_10s") {
    const now = Date.now();
    while (passiveSocialFeedEventWindow.length > 0 && passiveSocialFeedEventWindow[0] + PASSIVE_SOCIAL_FEED_EVENT_WINDOW_MS < now) {
      passiveSocialFeedEventWindow.shift();
    }
    if (passiveSocialFeedEventWindow.length >= PASSIVE_SOCIAL_FEED_EVENT_LIMIT) return false;
    passiveSocialFeedEventWindow.push(now);
  }
  const eventKey = `${sessionId}:${threadId}:${eventType}`;
  if (recordedSocialFeedEventKeys.has(eventKey)) return false;
  recordedSocialFeedEventKeys.add(eventKey);
  try {
    const data = await nativeSocialRpc<unknown>("record_social_feed_event", {
      p_thread_id: threadId,
      p_event_type: eventType,
      p_session_id: sessionId,
      p_metadata: metadata ?? {},
    }, accessToken);
    return data === true;
  } catch {
    recordedSocialFeedEventKeys.delete(eventKey);
    return false;
  }
}

async function readNativeStoredLinkPreviewMap(): Promise<Record<string, NativeSocialLinkPreview & { fetchedAt?: number }>> {
  try {
    const raw = await AsyncStorage.getItem(LINK_PREVIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, NativeSocialLinkPreview & { fetchedAt?: number }> : {};
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, preview]) => preview?.url && typeof preview.fetchedAt === "number" && now - preview.fetchedAt < LINK_PREVIEW_TTL_MS),
    );
  } catch {
    return {};
  }
}

async function writeNativeStoredLinkPreviewMap(entries: Record<string, NativeSocialLinkPreview & { fetchedAt?: number }>) {
  const sorted = Object.entries(entries)
    .sort(([, left], [, right]) => Number(right.fetchedAt ?? 0) - Number(left.fetchedAt ?? 0))
    .slice(0, LINK_PREVIEW_LRU_LIMIT);
  await AsyncStorage.setItem(LINK_PREVIEW_STORAGE_KEY, JSON.stringify(Object.fromEntries(sorted)));
}

async function fetchNativeSocialLinkPreview(url: string, accessToken?: string | null): Promise<NativeSocialLinkPreview> {
  const intrinsicPreview = buildNativeSocialIntrinsicLinkPreview(url);
  if (intrinsicPreview) return intrinsicPreview;
  try {
    const invokePromise = (async () => {
      const data = await nativeSocialFunctionRequest<Record<string, unknown> | null>("link-preview", { url }, accessToken);
      return { data: data ?? null, error: null };
    })();
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: new Error("preview_timeout") }), LINK_PREVIEW_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
    if (error || !data || data.failed === true) return buildFallbackLinkPreview(url, error?.message || "preview_failed");
    const title = cleanString(data.title) || undefined;
    const description = cleanString(data.description) || undefined;
    const image = cleanString(data.image) || undefined;
    const siteName = cleanString(data.siteName) || undefined;
    if (!(title || description || image || siteName)) return buildFallbackLinkPreview(url, "empty_metadata");
    const resolved: NativeSocialLinkPreview = {
      url,
      title,
      description,
      image,
      siteName,
      failed: false,
      resolved: true,
    };
    return resolved;
  } catch (error) {
    return buildFallbackLinkPreview(url, error instanceof Error ? error.message : "preview_exception");
  }
}

export async function fetchNativeSocialLinkPreviews(urls: string[], accessToken?: string | null): Promise<Record<string, NativeSocialLinkPreview>> {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
  if (uniqueUrls.length === 0) return {};

  const stored = await readNativeStoredLinkPreviewMap();
  const next: Record<string, NativeSocialLinkPreview> = {};
  uniqueUrls.forEach((url) => {
    const cached = stored[url];
    if (cached?.resolved) {
      const { fetchedAt: _fetchedAt, ...preview } = cached;
      next[url] = preview;
    }
  });

  const misses = uniqueUrls.filter((url) => !next[url]);
  for (let index = 0; index < misses.length; index += LINK_PREVIEW_QUEUE_LIMIT) {
    const chunk = misses.slice(index, index + LINK_PREVIEW_QUEUE_LIMIT);
    const resolvedMisses = await Promise.all(chunk.map((url) => fetchNativeSocialLinkPreview(url, accessToken)));
    resolvedMisses.forEach((preview) => {
      next[preview.url] = preview;
    });
  }

  const storedNext: Record<string, NativeSocialLinkPreview & { fetchedAt?: number }> = { ...stored };
  Object.entries(next).forEach(([url, preview]) => {
    if (preview.title || preview.description || preview.image || preview.siteName) {
      storedNext[url] = { ...preview, fetchedAt: Date.now() };
    }
  });
  await writeNativeStoredLinkPreviewMap(storedNext);
  return next;
}

export async function readNativeSocialStoredState(userId: string | null | undefined): Promise<StoredThreadState> {
  try {
    const [savedRaw, pinnedRaw] = await Promise.all([
      AsyncStorage.getItem(nativeSocialSavesStorageKey(userId)),
      AsyncStorage.getItem(nativeSocialPinsStorageKey(userId)),
    ]);
    const saved = savedRaw ? JSON.parse(savedRaw) as unknown : [];
    const pinned = pinnedRaw ? JSON.parse(pinnedRaw) as unknown : [];
    const savedEnvelope = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as StoredThreadState : null;
    const pinnedEnvelope = pinned && typeof pinned === "object" && !Array.isArray(pinned) ? pinned as StoredThreadState : null;
    const savedValues = Array.isArray(savedEnvelope?.saved) ? savedEnvelope.saved : saved;
    const pinnedValues = Array.isArray(pinnedEnvelope?.pinned) ? pinnedEnvelope.pinned : pinned;
    return {
      saved: Array.isArray(savedValues) ? savedValues.filter((item): item is string => typeof item === "string") : [],
      pinned: Array.isArray(pinnedValues) ? pinnedValues.filter((item): item is string => typeof item === "string") : [],
      pinnedAt: pinnedEnvelope?.pinnedAt && typeof pinnedEnvelope.pinnedAt === "object" ? pinnedEnvelope.pinnedAt : {},
      dbConfirmedAt: typeof savedEnvelope?.dbConfirmedAt === "number" ? savedEnvelope.dbConfirmedAt : undefined,
      source: "cache",
      status: "hydrating",
    };
  } catch {
    return { saved: [], pinned: [], pinnedAt: {}, source: "cache", status: "hydrating" };
  }
}

export async function writeNativeSocialStoredState(userId: string | null | undefined, state: StoredThreadState) {
  const dbConfirmedAt = Date.now();
  const envelope = {
    saved: state.saved,
    pinned: state.pinned,
    pinnedAt: state.pinnedAt || {},
    dbConfirmedAt,
    source: "db" as const,
    status: "fresh" as const,
  };
  await Promise.all([
    AsyncStorage.setItem(nativeSocialSavesStorageKey(userId), JSON.stringify(envelope)),
    AsyncStorage.setItem(nativeSocialPinsStorageKey(userId), JSON.stringify(envelope)),
  ]);
}

const mapNativeSocialPostPreference = (row: unknown): NativeSocialPostPreference | null => {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const threadId = typeof record.thread_id === "string" ? record.thread_id : "";
  if (!threadId) return null;
  return {
    threadId,
    isSaved: record.is_saved === true,
    isPinned: record.is_pinned === true,
    pinnedAt: typeof record.pinned_at === "string" ? record.pinned_at : null,
  };
};

export async function fetchNativeSocialPostPreferences(threadIds: string[], accessToken?: string | null): Promise<NativeSocialPostPreference[]> {
  const ids = Array.from(new Set(threadIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  const data = await nativeSocialRpc<unknown[]>("get_native_social_post_preferences", { p_thread_ids: ids }, accessToken);
  return (Array.isArray(data) ? data : []).map(mapNativeSocialPostPreference).filter((item): item is NativeSocialPostPreference => Boolean(item));
}

export async function setNativeSocialPostSaved(threadId: string, saved: boolean, accessToken?: string | null): Promise<boolean> {
  const data = await nativeSocialRpc<boolean>("set_native_social_post_saved", { p_thread_id: threadId, p_saved: saved }, accessToken);
  return data === true;
}

export async function setNativeSocialPostPinned(threadId: string, pinned: boolean, accessToken?: string | null): Promise<NativeSocialPostPreference> {
  const data = await nativeSocialRpc<unknown[]>("set_native_social_post_pinned", { p_thread_id: threadId, p_pinned: pinned }, accessToken);
  const preference = mapNativeSocialPostPreference(Array.isArray(data) ? data[0] : data);
  return preference || { threadId, isSaved: false, isPinned: false, pinnedAt: null };
}

export async function buildNativeSocialWebStorageHandoff(userId: string | null | undefined): Promise<Record<string, string>> {
  const state = await readNativeSocialStoredState(userId);
  return {
    [nativeSocialSavesStorageKey(userId)]: JSON.stringify(state.saved),
    [nativeSocialPinsStorageKey(userId)]: JSON.stringify(state.pinned),
  };
}
