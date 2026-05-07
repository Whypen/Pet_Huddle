import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { buildShareModel, serializeChatShareMessage } from "../../../src/lib/shareModel";
import { supabase } from "./supabase";

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
  lastLat: number | null;
  lastLng: number | null;
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
  userId: string;
  author: NativeSocialAuthor;
  mentions: NativeSocialMentionEntry[];
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
  userId: String(row.user_id || ""),
  author: {
    displayName: cleanString(row.author_display_name) || null,
    socialId: cleanString(row.author_social_id) || null,
    avatarUrl: cleanString(row.author_avatar_url) || null,
    verificationStatus: cleanString(row.author_verification_status) || null,
    locationCountry: cleanString(row.author_location_country) || null,
    lastLat: toNumber(row.author_last_lat, 0) || null,
    lastLng: toNumber(row.author_last_lng, 0) || null,
    isVerified: row.author_is_verified === true,
    nonSocial: row.author_non_social === true,
  },
});

async function hydrateNativeSocialRowsLegacy(rows: NativeSocialThread[]): Promise<NativeSocialThread[]> {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return rows;
  let hydratedRows = rows;

  const { data: shareRows } = await supabase
    .from("threads" as never)
    .select("id, clicks")
    .in("id", ids);
  if (Array.isArray(shareRows) && shareRows.length > 0) {
    const shareMap = new Map(
      (shareRows as Array<{ id?: string; clicks?: number | null }>).map((row) => [String(row.id || ""), toNumber(row.clicks, 0)]),
    );
    hydratedRows = hydratedRows.map((thread) => (
      shareMap.has(thread.id) ? { ...thread, shareCount: shareMap.get(thread.id) ?? thread.shareCount } : thread
    ));
  }

  const { data: alertRows, error: alertRowsError } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "get_social_feed_alert_context",
    { p_thread_ids: ids },
  );
  if (!alertRowsError && Array.isArray(alertRows) && alertRows.length > 0) {
    const alertMap = new Map(
      (alertRows as Array<{ thread_id?: string; map_id?: string | null; alert_type?: string | null; location_district?: string | null }>).map((row) => [
        String(row.thread_id || ""),
        {
          mapId: cleanString(row.map_id) || null,
          alertType: cleanString(row.alert_type) || null,
          alertDistrict: cleanString(row.location_district) || null,
          hasAlertLink: Boolean(cleanString(row.map_id) || cleanString(row.alert_type) || cleanString(row.location_district)),
        },
      ]),
    );
    hydratedRows = hydratedRows.map((thread) => {
      const alert = alertMap.get(thread.id);
      if (!alert) return thread;
      return {
        ...thread,
        mapId: alert.mapId ?? thread.mapId,
        alertType: alert.alertType ?? thread.alertType,
        alertDistrict: alert.alertDistrict ?? thread.alertDistrict,
        hasAlertLink: alert.hasAlertLink || thread.hasAlertLink,
      };
    });
  }

  const { data: sensitiveRows } = await supabase
    .from("threads" as never)
    .select("id, is_sensitive")
    .in("id", ids);
  if (Array.isArray(sensitiveRows) && sensitiveRows.length > 0) {
    const sensitiveMap = new Map(
      (sensitiveRows as Array<{ id?: string; is_sensitive?: boolean | null }>).map((row) => [String(row.id || ""), row.is_sensitive === true]),
    );
    hydratedRows = hydratedRows.map((thread) => ({ ...thread, isSensitive: sensitiveMap.get(thread.id) === true }));
  }

  const userIds = Array.from(new Set(hydratedRows.map((row) => row.userId).filter(Boolean)));
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles" as never)
      .select("id, social_id, display_name, avatar_url, is_verified, verification_status, location_country, last_lat, last_lng")
      .in("id", userIds);
    if (Array.isArray(profileRows) && profileRows.length > 0) {
      const profileMap = new Map(
        (profileRows as Array<{
          id?: string;
          social_id?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_verified?: boolean | null;
          verification_status?: string | null;
          location_country?: string | null;
          last_lat?: number | null;
          last_lng?: number | null;
        }>).map((row) => [
          String(row.id || ""),
          row,
        ]),
      );
      hydratedRows = hydratedRows.map((thread) => {
        const profile = profileMap.get(thread.userId);
        if (!profile) return thread;
        return {
          ...thread,
          author: {
            ...thread.author,
            displayName: cleanString(profile.display_name) || thread.author.displayName,
            socialId: cleanString(profile.social_id) || thread.author.socialId,
            avatarUrl: cleanString(profile.avatar_url) || thread.author.avatarUrl,
            verificationStatus: cleanString(profile.verification_status) || thread.author.verificationStatus,
            locationCountry: cleanString(profile.location_country) || thread.author.locationCountry,
            lastLat: typeof profile.last_lat === "number" ? profile.last_lat : thread.author.lastLat,
            lastLng: typeof profile.last_lng === "number" ? profile.last_lng : thread.author.lastLng,
            isVerified: profile.is_verified === true,
          },
        };
      });
    }
  }

  const { data: postMentionRows } = await supabase
    .from("post_mentions" as never)
    .select("post_id, mentioned_user_id, start_idx, end_idx, social_id_at_time")
    .in("post_id", ids)
    .order("start_idx", { ascending: true });
  if (Array.isArray(postMentionRows) && postMentionRows.length > 0) {
    const mentionsByThread = new Map<string, NativeSocialMentionEntry[]>();
    (postMentionRows as Array<{
      post_id?: string;
      mentioned_user_id?: string;
      start_idx?: number;
      end_idx?: number;
      social_id_at_time?: string;
    }>).forEach((row) => {
      const postId = String(row.post_id || "");
      if (!postId) return;
      mentionsByThread.set(postId, [
        ...(mentionsByThread.get(postId) || []),
        {
          start: Number(row.start_idx ?? 0),
          end: Number(row.end_idx ?? 0),
          mentionedUserId: String(row.mentioned_user_id || ""),
          socialIdAtTime: String(row.social_id_at_time || ""),
        },
      ]);
    });
    hydratedRows = hydratedRows.map((thread) => ({
      ...thread,
      mentions: (mentionsByThread.get(thread.id) || thread.mentions).filter((entry) => entry.mentionedUserId && entry.socialIdAtTime),
    }));
  }

  return hydratedRows;
}

export async function hydrateNativeSocialRows(rows: NativeSocialThread[]): Promise<NativeSocialThread[]> {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return rows;

  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "get_social_feed_hydration",
    { p_thread_ids: ids },
  );

  if (error || !Array.isArray(data)) return hydrateNativeSocialRowsLegacy(rows);
  const byThreadId = new Map(
    (data as Array<Record<string, unknown>>)
      .filter((row) => typeof row.thread_id === "string" && row.thread_id)
      .map((row) => [String(row.thread_id), row]),
  );

  return rows.map((thread) => {
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
        lastLat: toNumber(hydration.author_last_lat, thread.author.lastLat ?? 0) || thread.author.lastLat,
        lastLng: toNumber(hydration.author_last_lng, thread.author.lastLng ?? 0) || thread.author.lastLng,
        isVerified: hydration.author_is_verified === true || thread.author.isVerified,
      },
    };
  });
}

export async function fetchNativeSocialFeedPage(options: {
  viewerId: string;
  sortMode: NativeSocialSortMode;
  cursor?: NativeSocialFeedCursor | null;
}): Promise<NativeSocialFeedPage> {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "get_social_feed",
    {
      p_viewer_id: options.viewerId,
      p_sort: options.sortMode === "Saves" ? "Latest" : options.sortMode,
      p_limit: PAGE_LIMIT,
      p_cursor: options.cursor ?? null,
    },
  );
  if (error) throw error;
  const baseRows = (Array.isArray(data) ? data : []).map((row) => mapNativeSocialFeedRow(row as Record<string, unknown>));
  const rows = await hydrateNativeSocialRows(baseRows);
  return {
    rows,
    hasMore: baseRows.length === PAGE_LIMIT,
    cursor: buildNativeSocialCursor(rows[rows.length - 1] ?? baseRows[baseRows.length - 1]),
  };
}

export async function fetchNativeSocialThreadById(threadId: string): Promise<NativeSocialThread | null> {
  if (!threadId) return null;
  const { data, error } = await supabase
    .from("threads" as never)
    .select("id,title,content,tags,hashtags,images,created_at,user_id,likes,score,map_id,is_sensitive,clicks,video_provider,provider_video_id,video_playback_url,video_embed_url,video_thumbnail_url,video_preview_url,video_duration_seconds,video_status")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !data) return null;
  const [hydrated] = await hydrateNativeSocialRows([mapNativeSocialFeedRow(data as Record<string, unknown>)]);
  return hydrated || null;
}

export async function loadNativeBlockedSocialUserIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from("user_blocks" as never)
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error || !Array.isArray(data)) return new Set();
  const ids = new Set<string>();
  for (const row of data as Array<{ blocker_id?: string; blocked_id?: string }>) {
    if (row.blocker_id === userId && row.blocked_id) ids.add(row.blocked_id);
    if (row.blocked_id === userId && row.blocker_id) ids.add(row.blocker_id);
  }
  return ids;
}

export async function areNativeSocialUsersBlocked(userId: string, targetUserId: string) {
  if (!userId || !targetUserId) return false;
  const { data, error } = await supabase
    .from("user_blocks" as never)
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${userId})`)
    .limit(1);
  if (error || !Array.isArray(data)) return false;
  return data.length > 0;
}

export async function loadNativeSupportedSocialThreadIds(userId: string, threadIds: string[]): Promise<Set<string>> {
  if (!userId || threadIds.length === 0) return new Set();
  const ids = Array.from(new Set(threadIds.filter(Boolean)));
  if (ids.length === 0) return new Set();

  const { data, error } = await supabase
    .from("thread_supports" as never)
    .select("thread_id")
    .eq("user_id", userId)
    .in("thread_id", ids);

  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    (data as Array<{ thread_id?: string | null }>)
      .map((row) => row.thread_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}

export async function fetchNativeSocialComments(threadId: string): Promise<NativeSocialComment[]> {
  if (!threadId) return [];
  const { data, error } = await supabase
    .from("thread_comments" as never)
    .select(`
      id,
      thread_id,
      parent_comment_id,
      content,
      images,
      created_at,
      user_id,
      author:profiles!thread_comments_user_id_fkey(display_name, social_id, avatar_url, is_verified, verification_status, location_country, last_lat, last_lng)
    `)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  const comments = rows.map((row) => {
    const authorObj = Array.isArray(row.author) ? row.author[0] : row.author;
    const author = (authorObj && typeof authorObj === "object") ? authorObj as Record<string, unknown> : {};
    return {
      id: String(row.id || ""),
      threadId: String(row.thread_id || threadId),
      parentCommentId: cleanString(row.parent_comment_id) || null,
      content: String(row.content || ""),
      images: isStringArray(row.images) ? row.images : [],
      createdAt: String(row.created_at || new Date().toISOString()),
      userId: String(row.user_id || ""),
      author: {
        displayName: cleanString(author.display_name) || null,
        socialId: cleanString(author.social_id) || null,
        avatarUrl: cleanString(author.avatar_url) || null,
        verificationStatus: cleanString(author.verification_status) || null,
        locationCountry: cleanString(author.location_country) || null,
        lastLat: toNumber(author.last_lat, 0) || null,
        lastLng: toNumber(author.last_lng, 0) || null,
        isVerified: author.is_verified === true,
        nonSocial: false,
      },
      mentions: [],
    } satisfies NativeSocialComment;
  });

  const ids = comments.map((comment) => comment.id).filter(Boolean);
  if (ids.length === 0) return comments;

  const { data: mentionRows } = await supabase
    .from("reply_mentions" as never)
    .select("reply_id, mentioned_user_id, start_idx, end_idx, social_id_at_time")
    .in("reply_id", ids)
    .order("start_idx", { ascending: true });
  const mentionsByReply = new Map<string, NativeSocialMentionEntry[]>();
  if (Array.isArray(mentionRows)) {
    (mentionRows as Array<Record<string, unknown>>).forEach((row) => {
      const replyId = String(row.reply_id || "");
      if (!replyId) return;
      mentionsByReply.set(replyId, [
        ...(mentionsByReply.get(replyId) || []),
        {
          start: Number(row.start_idx ?? 0),
          end: Number(row.end_idx ?? 0),
          mentionedUserId: String(row.mentioned_user_id || ""),
          socialIdAtTime: String(row.social_id_at_time || ""),
        },
      ]);
    });
  }
  return comments.map((comment) => ({ ...comment, mentions: mentionsByReply.get(comment.id) || [] }));
}

export async function uploadNativeSocialImage(userId: string, media: NativeSocialComposerMedia, scope: "thread" | "reply" | "report"): Promise<string> {
  const info = await FileSystem.getInfoAsync(media.uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const ext = (media.name?.split(".").pop() || media.mimeType?.split("/").pop() || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${userId}/${scope}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(media.uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToUint8Array(base64);
  if (body.byteLength === 0) throw new Error("Selected image is empty.");
  const { error } = await supabase.storage.from("notices").upload(path, body, {
    cacheControl: "3600",
    contentType: media.mimeType || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  if (__DEV__) {
    console.log("STORAGE_URL_GET_PUBLIC", { bucket: "notices", path });
  }
  const { data } = supabase.storage.from("notices").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Image upload failed.");
  const publicUrlCheck = await fetch(data.publicUrl);
  if (!publicUrlCheck.ok) throw new Error("Image upload could not be verified.");
  const uploadedBytes = await publicUrlCheck.arrayBuffer();
  if (uploadedBytes.byteLength === 0) throw new Error("Image upload produced an empty file.");
  return data.publicUrl;
}

export async function createNativeSocialVideoUpload(userId: string, media: NativeSocialComposerMedia, title: string) {
  if (Number(media.durationSeconds ?? 0) > SOCIAL_VIDEO_MAX_SECONDS + 0.5) {
    throw new Error("Video must be trimmed to 15 seconds before upload.");
  }
  const fileInfo = await FileSystem.getInfoAsync(media.uri);
  if (!fileInfo.exists) throw new Error("Selected video is unavailable.");
  const tus = await import("tus-js-client");
  const response = await fetch(media.uri);
  const blob = await response.blob();
  const durationSeconds = Math.max(1, Math.min(SOCIAL_VIDEO_MAX_SECONDS, Number(media.durationSeconds ?? SOCIAL_VIDEO_MAX_SECONDS)));
  const { data: createData, error: createError } = await supabase.functions.invoke<{
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
    body: {
      title: title || "Social video",
      durationSeconds,
      fileName: media.name || "social-video.mp4",
      fileType: media.mimeType || "video/mp4",
      fileSize: Number(media.size || blob.size || 0),
    },
  });
  if (createError) throw createError;
  if (!createData?.videoId) throw new Error("Video upload authorization failed.");

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
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
    upload.start();
  });

  const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke<Record<string, unknown>>("social-video-finalize", {
    body: { videoId: createData.videoId, durationSeconds },
  });
  if (finalizeError) throw finalizeError;
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

export async function deleteNativeSocialVideo(providerVideoId: string) {
  if (!providerVideoId) return;
  await supabase.functions.invoke("social-video-delete", { body: { videoId: providerVideoId } });
}

export async function createNativeSocialThread(args: {
  category: string;
  content: string;
  images: string[];
  isSensitive: boolean;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
}) {
  const { data, error } = await supabase
    .from("threads" as never)
    .insert({
      title: args.title,
      content: args.content,
      tags: [args.category || "Social"],
      images: args.images,
      user_id: args.userId,
      is_sensitive: args.isSensitive,
      is_public: true,
      ...(args.video ? {
        video_provider: args.video.provider,
        provider_video_id: args.video.providerVideoId,
        video_playback_url: args.video.playbackUrl,
        video_embed_url: args.video.embedUrl,
        video_thumbnail_url: args.video.thumbnailUrl,
        video_preview_url: args.video.previewUrl,
        video_duration_seconds: args.video.duration,
        video_status: args.video.status,
      } : {}),
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return String((data as { id?: string })?.id || "");
}

export async function updateNativeSocialThread(args: {
  category: string;
  content: string;
  id: string;
  images?: string[];
  isSensitive: boolean;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
}) {
  const { error } = await supabase
    .from("threads" as never)
    .update({
      title: args.title,
      content: args.content,
      tags: [args.category || "Social"],
      ...(args.images ? { images: args.images } : {}),
      is_sensitive: args.isSensitive,
      ...(args.video ? {
        video_provider: args.video.provider,
        provider_video_id: args.video.providerVideoId,
        video_playback_url: args.video.playbackUrl,
        video_embed_url: args.video.embedUrl,
        video_thumbnail_url: args.video.thumbnailUrl,
        video_preview_url: args.video.previewUrl,
        video_duration_seconds: args.video.duration,
        video_status: args.video.status,
      } : {}),
    } as never)
    .eq("id", args.id)
    .eq("user_id", args.userId);
  if (error) throw error;
}

export async function deleteNativeSocialThread(thread: NativeSocialThread, userId: string) {
  const { error } = await supabase
    .from("threads" as never)
    .delete()
    .eq("id", thread.id)
    .eq("user_id", userId);
  if (error) throw error;
  if (thread.providerVideoId) void deleteNativeSocialVideo(thread.providerVideoId);
}

export async function createNativeSocialComment(args: {
  content: string;
  images: string[];
  parentCommentId?: string | null;
  threadId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("thread_comments" as never)
    .insert({
      thread_id: args.threadId,
      parent_comment_id: args.parentCommentId || null,
      user_id: args.userId,
      content: args.content,
      text: args.content,
      images: args.images,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return String((data as { id?: string })?.id || "");
}

export async function persistNativeSocialReplyMentions(
  replyId: string,
  mentions: NativeSocialMentionEntry[],
) {
  if (!replyId || mentions.length === 0) return;
  const rows = mentions.map((entry) => ({
    reply_id: replyId,
    mentioned_user_id: entry.mentionedUserId,
    start_idx: entry.start,
    end_idx: entry.end,
    social_id_at_time: entry.socialIdAtTime,
  }));
  const { error } = await supabase.from("reply_mentions" as never).insert(rows as never);
  if (error) throw error;
}

export async function replaceNativeSocialReplyMentions(
  replyId: string,
  mentions: NativeSocialMentionEntry[],
) {
  if (!replyId) return;
  const deleteResult = await supabase.from("reply_mentions" as never).delete().eq("reply_id", replyId);
  if (deleteResult.error) throw deleteResult.error;
  if (mentions.length === 0) return;
  const rows = mentions.map((entry) => ({
    reply_id: replyId,
    mentioned_user_id: entry.mentionedUserId,
    start_idx: entry.start,
    end_idx: entry.end,
    social_id_at_time: entry.socialIdAtTime,
  }));
  const { error } = await supabase.from("reply_mentions" as never).insert(rows as never);
  if (error) throw error;
}

export async function persistNativeSocialPostMentions(
  postId: string,
  mentions: NativeSocialMentionEntry[],
) {
  if (!postId) return;
  await supabase.from("post_mentions" as never).delete().eq("post_id", postId);
  if (mentions.length === 0) return;
  const rows = mentions.map((entry) => ({
    post_id: postId,
    mentioned_user_id: entry.mentionedUserId,
    start_idx: entry.start,
    end_idx: entry.end,
    social_id_at_time: entry.socialIdAtTime,
  }));
  const { error } = await supabase.from("post_mentions" as never).insert(rows as never);
  if (error) throw error;
}

export async function resolveNativeSocialMentionsFromText(value: string): Promise<NativeSocialMentionEntry[]> {
  const matches = Array.from(value.matchAll(/(^|[\s(])@([a-zA-Z0-9._]{2,30})/g));
  const tokens = Array.from(new Set(matches.map((match) => String(match[2] || "").toLowerCase()).filter(Boolean)));
  if (tokens.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles" as never)
    .select("id, social_id")
    .in("social_id", tokens);
  if (error || !Array.isArray(data)) return [];

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

export async function searchNativeSocialMentionSuggestions(query: string, excludeUserId?: string | null): Promise<NativeSocialMentionSuggestion[]> {
  const normalized = query.trim().replace(/^@/, "").toLowerCase();
  if (normalized.length > 24) return [];
  const safeQuery = normalized.replace(/[%_]/g, "");
  const excludedId = String(excludeUserId || "").trim();
  const selectProfiles = (pattern: string, column: "social_id" | "display_name") => {
    let builder = supabase
      .from("profiles" as never)
      .select("id, social_id, display_name, avatar_url")
      .not("social_id", "is", null)
      .ilike(column, pattern);
    if (excludedId) builder = builder.neq("id", excludedId);
    return builder.limit(8);
  };
  const results = safeQuery
    ? await Promise.all([
      selectProfiles(`${safeQuery}%`, "social_id"),
      selectProfiles(`${safeQuery}%`, "display_name"),
      safeQuery.length >= 2 ? selectProfiles(`%${safeQuery}%`, "social_id") : Promise.resolve({ data: [], error: null }),
      safeQuery.length >= 2 ? selectProfiles(`%${safeQuery}%`, "display_name") : Promise.resolve({ data: [], error: null }),
    ])
    : [await (excludedId
      ? supabase.from("profiles" as never).select("id, social_id, display_name, avatar_url").not("social_id", "is", null).neq("id", excludedId)
      : supabase.from("profiles" as never).select("id, social_id, display_name, avatar_url").not("social_id", "is", null)
    ).limit(10)];

  const rows = results.flatMap((result) => Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : []);
  const seen = new Set<string>();
  return rows
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

export async function createNativeSocialMentionNotifications(threadId: string, actorId: string, mentionedUserIds: string[]) {
  const uniqueIds = Array.from(new Set(mentionedUserIds.filter(Boolean)));
  if (!threadId || !actorId || uniqueIds.length === 0) return;
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)("create_thread_mention_notifications", {
    p_actor_id: actorId,
    p_thread_id: threadId,
    p_recipient_ids: uniqueIds,
  });
  if (error) throw error;
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
}) {
  if (!args.ownerUserId || !args.subjectId || !args.actorId) return;
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)("upsert_notification_window", {
    p_actor_id: args.actorId,
    p_actor_name: args.actorName,
    p_category: args.category,
    p_href: args.href,
    p_kind: args.kind,
    p_owner_user_id: args.ownerUserId,
    p_subject_id: args.subjectId,
    p_subject_type: args.subjectType,
  });
  if (error) throw error;
}

export async function updateNativeSocialComment(commentId: string, userId: string, content: string) {
  const { error } = await supabase
    .from("thread_comments" as never)
    .update({ content, text: content } as never)
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteNativeSocialComment(commentId: string, userId: string) {
  const { error } = await supabase
    .from("thread_comments" as never)
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setNativeSocialSupport(thread: NativeSocialThread, userId: string, supported: boolean) {
  if (supported) {
    const { error } = await supabase.from("thread_supports" as never).delete().eq("thread_id", thread.id).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("thread_supports" as never).insert({ thread_id: thread.id, user_id: userId } as never);
    if (error) {
      const code = String((error as { code?: string }).code || "");
      const message = String((error as { message?: string }).message || "").toLowerCase();
      if (!(code === "23505" || message.includes("duplicate") || message.includes("conflict"))) throw error;
    }
  }
  const { count } = await supabase
    .from("thread_supports" as never)
    .select("id", { count: "exact", head: true })
    .eq("thread_id", thread.id);
  return Number(count ?? 0);
}

export async function blockNativeSocialUser(authorId: string) {
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)("block_user", { p_blocked_id: authorId });
  if (error) throw error;
}

export async function reportNativeSocialUser(args: {
  categories: string[];
  details: string | null;
  other?: string;
  reporterId: string;
  source?: "Social" | "Chat" | "Group Chat" | "Map";
  sourceOrigin?: "social" | "friends chats" | "maps" | "other";
  targetUserId: string;
  targetName?: string | null;
  attachmentUrls?: string[];
}) {
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>)("process_user_report", {
    p_target_id: args.targetUserId,
    p_categories: args.categories,
    p_details: args.details,
    p_attachment_urls: args.attachmentUrls ?? [],
    p_source: args.sourceOrigin ?? "social",
  });
  if (error) throw error;
  void supabase.functions.invoke("support-request", {
    body: {
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
    },
  });
}

export async function recordNativeSocialShare(threadId: string): Promise<number | null> {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)("record_thread_share_click", { p_thread_id: threadId });
  if (error) return null;
  return typeof data === "number" ? data : null;
}

export async function fetchNativeSocialShareTargets(userId: string): Promise<NativeSocialShareTarget[]> {
  if (!userId) return [];
  const { data: memberships, error: membershipError } = await supabase
    .from("chat_room_members" as never)
    .select("chat_id")
    .eq("user_id", userId);
  if (membershipError) throw membershipError;
  const chatIds = Array.from(new Set(
    ((memberships || []) as Array<{ chat_id?: string | null }>)
      .map((row) => String(row.chat_id || "").trim())
      .filter(Boolean),
  ));
  if (chatIds.length === 0) return [];

  const [{ data: chatRows, error: chatError }, { data: serviceRows }, { data: messageRows }, { data: memberRows }] = await Promise.all([
    supabase.from("chats" as never).select("id,name,avatar_url,last_message_at,type").in("id", chatIds),
    supabase.from("service_chats" as never).select("chat_id").in("chat_id", chatIds),
    supabase.from("chat_messages" as never).select("chat_id,content,created_at").in("chat_id", chatIds).order("created_at", { ascending: false }),
    supabase
      .from("chat_room_members" as never)
      .select("chat_id,user_id,profiles!chat_room_members_user_id_fkey(id,display_name,social_id,avatar_url)")
      .in("chat_id", chatIds),
  ]);
  if (chatError) throw chatError;

  const serviceChatIds = new Set(((serviceRows || []) as Array<{ chat_id?: string | null }>).map((row) => String(row.chat_id || "").trim()).filter(Boolean));
  const latestByChat = new Map<string, { content: string; created_at: string | null }>();
  ((messageRows || []) as Array<{ chat_id?: string | null; content?: string | null; created_at?: string | null }>).forEach((row) => {
    const chatId = String(row.chat_id || "").trim();
    if (!chatId || latestByChat.has(chatId)) return;
    latestByChat.set(chatId, { content: String(row.content || "").trim(), created_at: row.created_at || null });
  });
  const membersByChat = new Map<string, Array<Record<string, unknown>>>();
  ((memberRows || []) as Array<Record<string, unknown>>).forEach((row) => {
    const chatId = String(row.chat_id || "").trim();
    if (!chatId) return;
    membersByChat.set(chatId, [...(membersByChat.get(chatId) || []), row]);
  });

  const peerIds = Array.from(new Set(
    ((memberRows || []) as Array<{ user_id?: string | null }>)
      .map((row) => String(row.user_id || "").trim())
      .filter((id) => id && id !== userId),
  ));
  const blockedByMe = new Set<string>();
  const blockedByThem = new Set<string>();
  const unmatchedByThem = new Set<string>();
  const matchedPeerIds = new Set<string>();
  if (peerIds.length > 0) {
    const [{ data: matches }, { data: blocksFromMe }, { data: blocksToMe }, { data: unmatchesToMe }] = await Promise.all([
      supabase.from("matches" as never).select("user1_id,user2_id").or(`user1_id.eq.${userId},user2_id.eq.${userId}`).eq("is_active", true).limit(500),
      supabase.from("user_blocks" as never).select("blocked_id").eq("blocker_id", userId).in("blocked_id", peerIds),
      supabase.from("user_blocks" as never).select("blocker_id").eq("blocked_id", userId).in("blocker_id", peerIds),
      supabase.from("user_unmatches" as never).select("actor_id").eq("target_id", userId).in("actor_id", peerIds),
    ]);
    ((matches || []) as Array<{ user1_id?: string | null; user2_id?: string | null }>).forEach((row) => {
      const peer = row.user1_id === userId ? row.user2_id : row.user1_id;
      if (peer) matchedPeerIds.add(peer);
    });
    ((blocksFromMe || []) as Array<{ blocked_id?: string | null }>).forEach((row) => { if (row.blocked_id) blockedByMe.add(row.blocked_id); });
    ((blocksToMe || []) as Array<{ blocker_id?: string | null }>).forEach((row) => { if (row.blocker_id) blockedByThem.add(row.blocker_id); });
    ((unmatchesToMe || []) as Array<{ actor_id?: string | null }>).forEach((row) => { if (row.actor_id) unmatchedByThem.add(row.actor_id); });
  }

  const deduped = new Map<string, NativeSocialShareTarget>();
  ((chatRows || []) as Array<Record<string, unknown>>).forEach((chat) => {
    const chatId = String(chat.id || "").trim();
    if (!chatId) return;
    const latest = latestByChat.get(chatId);
    if (!chat.last_message_at && !latest?.content) return;
    const rows = membersByChat.get(chatId) || [];
    const peers = rows.filter((row) => String(row.user_id || "") !== userId);
    const primaryPeer = peers[0] || null;
    const profile = primaryPeer?.profiles && typeof primaryPeer.profiles === "object" ? primaryPeer.profiles as Record<string, unknown> : {};
    const isGroup = chat.type === "group";
    const isService = serviceChatIds.has(chatId) || chat.type === "service";
    const peerUserId = primaryPeer ? String(primaryPeer.user_id || "").trim() : "";
    if (!isGroup && !isService) {
      if (!peerUserId || !matchedPeerIds.has(peerUserId) || blockedByMe.has(peerUserId) || blockedByThem.has(peerUserId) || unmatchedByThem.has(peerUserId)) return;
    }
    const peerName = cleanString(profile.display_name);
    const chatName = cleanString(chat.name);
    const socialId = cleanString(profile.social_id).replace(/^@+/, "");
    const label = isGroup ? (chatName || "Group chat") : (peerName || chatName || "Conversation");
    if (!isGroup && !isService && label === "Conversation" && !socialId && !cleanString(profile.avatar_url)) return;
    const target: NativeSocialShareTarget = {
      avatarUrl: isGroup ? cleanString(chat.avatar_url) || null : cleanString(profile.avatar_url) || cleanString(chat.avatar_url) || null,
      chatId,
      label,
      lastMessageAt: cleanString(chat.last_message_at) || latest?.created_at || null,
      socialId: isGroup ? null : socialId || null,
      subtitle: isGroup ? "Group chat" : isService ? "Service" : socialId ? `@${socialId}` : "Chat",
      type: isGroup ? "group" : isService ? "service" : "direct",
      userId: isGroup ? null : peerUserId || null,
    };
    const key = isGroup ? `chat:${chatId}` : socialId ? `social:${socialId.toLowerCase()}` : peerUserId ? `user:${peerUserId}` : `chat:${chatId}`;
    const existing = deduped.get(key);
    if (!existing || String(target.lastMessageAt || "").localeCompare(String(existing.lastMessageAt || "")) > 0) deduped.set(key, target);
  });

  return Array.from(deduped.values()).sort((left, right) => String(right.lastMessageAt || "").localeCompare(String(left.lastMessageAt || "")));
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

export async function sendNativeSocialShareToChat(thread: NativeSocialThread, target: NativeSocialShareTarget, userId: string) {
  if (!userId || !target.chatId) throw new Error("Share target is unavailable.");
  const { error } = await supabase.from("chat_messages" as never).insert({
    chat_id: target.chatId,
    sender_id: userId,
    content: serializeChatShareMessage(buildNativeSocialSharePayload(thread)),
  } as never);
  if (error) throw error;
}

export async function sendNativeMapAlertShareToChat(alert: Parameters<typeof buildNativeMapAlertSharePayload>[0], target: NativeSocialShareTarget, userId: string) {
  if (!userId || !target.chatId) throw new Error("Share target is unavailable.");
  const { error } = await supabase.from("chat_messages" as never).insert({
    chat_id: target.chatId,
    sender_id: userId,
    content: serializeChatShareMessage(buildNativeMapAlertSharePayload(alert)),
  } as never);
  if (error) throw error;
}


export async function recordNativeSocialFeedEvent({
  eventType,
  metadata,
  sessionId,
  threadId,
  userId,
}: {
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
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
      "record_social_feed_event",
      {
        p_thread_id: threadId,
        p_event_type: eventType,
        p_session_id: sessionId,
        p_metadata: metadata ?? {},
      },
    );
    if (error) {
      recordedSocialFeedEventKeys.delete(eventKey);
      return false;
    }
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

async function fetchNativeSocialLinkPreview(url: string): Promise<NativeSocialLinkPreview> {
  const intrinsicPreview = buildNativeSocialIntrinsicLinkPreview(url);
  if (intrinsicPreview) return intrinsicPreview;
  try {
    const invokePromise = (async () => {
      const { data, error } = await supabase.functions.invoke("link-preview", { body: { url } });
      return {
        data: (data as Record<string, unknown> | null) ?? null,
        error: error ? new Error(error.message) : null,
      };
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
    void (supabase.from("link_preview_cache" as never) as unknown as {
      upsert: (row: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<unknown>;
    }).upsert(
      { url_hash: url.toLowerCase(), url, payload: { title, description, image, siteName }, fetched_at: new Date().toISOString() },
      { onConflict: "url_hash" },
    );
    return resolved;
  } catch (error) {
    return buildFallbackLinkPreview(url, error instanceof Error ? error.message : "preview_exception");
  }
}

export async function fetchNativeSocialLinkPreviews(urls: string[]): Promise<Record<string, NativeSocialLinkPreview>> {
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

  const missingAfterLocal = uniqueUrls.filter((url) => !next[url]);
  if (missingAfterLocal.length > 0) {
    const hashes = missingAfterLocal.map((url) => url.toLowerCase());
    try {
		      const { data } = await (supabase.from("link_preview_cache" as never) as unknown as {
		        select: (cols: string) => {
		          in: (column: string, values: string[]) => Promise<{
		            data: Array<{ url: string; payload: { title?: string; description?: string; image?: string; siteName?: string } }> | null;
		          }>;
		        };
		      }).select("url, payload").in("url_hash", hashes);
      for (const row of data || []) {
        if (!row?.url || !row.payload) continue;
        const preview: NativeSocialLinkPreview = {
          url: row.url,
          title: row.payload.title || undefined,
          description: row.payload.description || undefined,
          image: row.payload.image || undefined,
          siteName: row.payload.siteName || undefined,
          failed: false,
          resolved: true,
        };
        if (preview.title || preview.description || preview.image || preview.siteName) next[row.url] = preview;
      }
    } catch {
      // Cache lookup failure falls through to the same edge-function path as web.
    }
  }

  const misses = uniqueUrls.filter((url) => !next[url]);
  for (let index = 0; index < misses.length; index += LINK_PREVIEW_QUEUE_LIMIT) {
    const chunk = misses.slice(index, index + LINK_PREVIEW_QUEUE_LIMIT);
    const resolvedMisses = await Promise.all(chunk.map((url) => fetchNativeSocialLinkPreview(url)));
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
    return {
      saved: Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : [],
      pinned: Array.isArray(pinned) ? pinned.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return { saved: [], pinned: [] };
  }
}

export async function writeNativeSocialStoredState(userId: string | null | undefined, state: StoredThreadState) {
  await Promise.all([
    AsyncStorage.setItem(nativeSocialSavesStorageKey(userId), JSON.stringify(state.saved)),
    AsyncStorage.setItem(nativeSocialPinsStorageKey(userId), JSON.stringify(state.pinned)),
  ]);
}

export async function buildNativeSocialWebStorageHandoff(userId: string | null | undefined): Promise<Record<string, string>> {
  const state = await readNativeSocialStoredState(userId);
  return {
    [nativeSocialSavesStorageKey(userId)]: JSON.stringify(state.saved),
    [nativeSocialPinsStorageKey(userId)]: JSON.stringify(state.pinned),
  };
}
