import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { buildShareModel, serializeChatShareMessage } from "./shareModel";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { fetchNativeEngagementTiers, type NativeEngagementSummary } from "./nativeEngagement";
import { getFreshNativeAccessToken } from "./nativeFunctionClient";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { readNativeLocalMediaFile } from "./nativeLocalMediaUpload";
import { registerNativeMediaAsset } from "./nativeMediaAssets";
import { normalizeNativeSocialShareTargetsForDisplay } from "./nativeSocialShareTargets";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult, type NativeProtectedActionCleanupResult } from "./nativeStorageCleanup";
import { requireCurrentNativeSession } from "./nativeSessionGuard";
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
  engagement?: NativeEngagementSummary | null;
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
  updatedAt?: string | null;
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
  imageMetadata: NativeSocialImageMetadata[];
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
  postCountry: string | null;
  postCity: string | null;
  postDistrict: string | null;
  postLanguage: string | null;
  postLocationSource: string | null;
  author: NativeSocialAuthor;
  localStatus?: "pending" | "failed";
};

export type NativeSocialImageMetadata = {
  aspectRatio: number | null;
  height: number | null;
  url: string;
  width: number | null;
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
  imageMetadata: NativeSocialImageMetadata[];
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

const DEFAULT_SOCIAL_FEED_PAGE_LIMIT = 20;
const SOCIAL_PINS_STORAGE_PREFIX = "huddle_social_pins";
const SOCIAL_SAVES_STORAGE_PREFIX = "huddle_social_saves";
const LINK_PREVIEW_STORAGE_KEY = "noticeboard_link_preview_lru_v1";
const LINK_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_PREVIEW_LRU_LIMIT = 120;
const LINK_PREVIEW_QUEUE_LIMIT = 3;
const LINK_PREVIEW_TIMEOUT_MS = 7000;
const nativeSocialLinkPreviewInFlight = new Map<string, Promise<NativeSocialLinkPreview>>();
const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/i;
const BARE_DOMAIN_PATTERN = /(?:^|[\s(])((?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>"')\]]*)?)/i;

const toPositiveNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const buildNativeSocialImageMetadata = (items: Array<{ height?: number | null; uri?: string | null; uploadedUrl?: string | null; width?: number | null }>): NativeSocialImageMetadata[] => (
  items
    .map((item) => {
      const url = cleanString(item.uploadedUrl) || cleanString(item.uri);
      if (!url) return null;
      const width = toPositiveNumber(item.width);
      const height = toPositiveNumber(item.height);
      return {
        aspectRatio: width && height ? width / height : null,
        height,
        url,
        width,
      };
    })
    .filter((item): item is NativeSocialImageMetadata => Boolean(item))
);

const parseNativeSocialImageMetadata = (value: unknown, fallbackImages: string[] = []): NativeSocialImageMetadata[] => {
  const entries = Array.isArray(value) ? value : [];
  const parsed = entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const url = cleanString(record.url ?? record.uri ?? record.src);
      if (!url) return null;
      const width = toPositiveNumber(record.width);
      const height = toPositiveNumber(record.height);
      const aspectRatio = toPositiveNumber(record.aspectRatio ?? record.aspect_ratio) ?? (width && height ? width / height : null);
      return { aspectRatio, height, url, width };
    })
    .filter((item): item is NativeSocialImageMetadata => Boolean(item));
  if (parsed.length > 0) return parsed;
  return fallbackImages.map((url) => ({ aspectRatio: null, height: null, url, width: null }));
};
const HUDDLE_PREVIEW_IMAGE = "https://huddle.pet/brandweb/og-card.png";
const HUDDLE_PREVIEW_TITLE = "huddle — Pet safety, community & care";
const HUDDLE_PREVIEW_DESCRIPTION = "One app for lost pets, trusted carers, local pet community, and organised pet records. No pet left behind.";
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

type NativeSocialSessionOptions = {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
};

const requireNativeSocialSession = (options: NativeSocialSessionOptions) => requireCurrentNativeSession({
  accessToken: options.accessToken,
  expectedUserId: options.userId,
  sessionKey: options.sessionKey,
});

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
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, accessToken);
  if (error) throw error;
  return data as T;
};

const nativeSocialFunctionRequest = async <T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("auth_required");
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
    const message = parsed && typeof parsed === "object"
      ? String((parsed as { message?: unknown; error?: unknown }).message || (parsed as { error?: unknown }).error || response.statusText)
      : response.statusText;
    throw new Error(message || "request_failed");
  }
  return parsed as T;
};

const buildPublicStorageUrl = (bucket: string, path: string) => {
  const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
};

const encodeStorageObjectPath = (bucket: string, path: string) =>
  `${encodeURIComponent(bucket)}/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;

export const nativeSocialPinsStorageKey = (userId: string | null | undefined) => `${SOCIAL_PINS_STORAGE_PREFIX}:${userId || "anon"}`;
export const nativeSocialSavesStorageKey = (userId: string | null | undefined) => `${SOCIAL_SAVES_STORAGE_PREFIX}:${userId || "anon"}`;

export const extractNativeSocialFirstHttpUrl = (value: string) => {
  const match = String(value || "").match(URL_PATTERN);
  if (match?.[1]) return match[1].replace(/[|.,!?;:)\]]+$/g, "");
  const bareDomainMatch = String(value || "").match(BARE_DOMAIN_PATTERN);
  const bareDomainUrl = bareDomainMatch?.[1]?.replace(/[|.,!?;:)\]]+$/g, "");
  if (!bareDomainUrl) return null;
  return `https://${bareDomainUrl}`;
};

export const stripNativeSocialExternalUrlFromText = (value: string, url: string | null | undefined) => {
  if (!url) return value;
  return nativeSocialUrlTextCandidates(url)
    .reduce((next, candidate) => next.replace(candidate, ""), String(value || ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const nativeSocialUrlTextCandidates = (url: string | null | undefined) => {
  const cleanUrl = cleanString(url);
  if (!cleanUrl) return [];
  const candidates = [cleanUrl];
  try {
    const parsed = new URL(cleanUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    const suffix = `${path}${parsed.search}${parsed.hash}`;
    const host = parsed.hostname.toLowerCase();
    candidates.push(`${parsed.hostname}${suffix}`);
    if (host.startsWith("www.")) candidates.push(`${parsed.hostname.replace(/^www\./, "")}${suffix}`);
    else candidates.push(`www.${parsed.hostname}${suffix}`);
  } catch {
    // Non-URL labels only use the original candidate.
  }
  return Array.from(new Set(candidates.filter(Boolean)));
};

export const extractCompletedNativeSocialPreviewUrl = (value: string) => {
  const url = extractNativeSocialFirstHttpUrl(value);
  if (!url) return null;
  const rawValue = String(value || "");
  const lowerValue = rawValue.toLowerCase();
  const matchedCandidate = nativeSocialUrlTextCandidates(url).find((candidate) => lowerValue.includes(candidate.toLowerCase()));
  if (!matchedCandidate) return null;
  const urlIndex = lowerValue.indexOf(matchedCandidate.toLowerCase());
  if (urlIndex < 0) return null;
  const nextText = rawValue.slice(urlIndex + matchedCandidate.length);
  if (nextText.length === 0) return null;
  if (/^\s/.test(nextText) || /^[|.,!?;:)\]]+\s/.test(nextText)) return url;
  return null;
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
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (parsed.hostname.replace(/^www\./, "").toLowerCase() === "huddle.pet") {
      return {
        url,
        title: HUDDLE_PREVIEW_TITLE,
        description: HUDDLE_PREVIEW_DESCRIPTION,
        image: HUDDLE_PREVIEW_IMAGE,
        siteName: "huddle",
        loading: false,
        failed: false,
        resolved: true,
      };
    }
  } catch {
    // Non-URL values fall through to the external preview path.
  }
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

export const mapNativeSocialFeedRow = (row: Record<string, unknown>): NativeSocialThread => {
  const mapId = cleanString(row.map_id) || null;
  const images = isStringArray(row.images) ? row.images.filter((entry) => entry.trim().length > 0) : [];
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    content: String(row.content || ""),
    tags: isStringArray(row.tags) ? row.tags : [],
    hashtags: isStringArray(row.hashtags) ? row.hashtags : [],
    mentions: parseMentionEntries(row.thread_mentions),
    images,
    imageMetadata: parseNativeSocialImageMetadata(row.image_metadata, images),
    likes: toNumber(row.like_count ?? row.likes, 0),
    commentCount: toNumber(row.comment_count, 0),
    shareCount: toNumber(row.share_count ?? row.clicks, 0),
    score: toNumber(row.score, 0),
    mapId,
    alertType: cleanString(row.alert_type) || null,
    alertDistrict: cleanString(row.alert_district) || null,
    hasAlertLink: Boolean(mapId && row.has_alert_link === true),
    isSensitive: row.is_sensitive === true,
    videoProvider: row.video_provider === "bunny_stream" ? "bunny_stream" : null,
    providerVideoId: cleanString(row.provider_video_id) || null,
    videoPlaybackUrl: cleanString(row.video_playback_url) || null,
    videoEmbedUrl: cleanString(row.video_embed_url) || null,
    videoThumbnailUrl: cleanString(row.video_thumbnail_url) || null,
    videoPreviewUrl: cleanString(row.video_preview_url) || null,
    videoDurationSeconds: toNumber(row.video_duration_seconds, 0) || null,
    videoStatus: cleanString(row.video_status) || null,
    postCountry: cleanString(row.post_country) || null,
    postCity: cleanString(row.post_city) || null,
    postDistrict: cleanString(row.post_district) || null,
    postLanguage: cleanString(row.post_language) || null,
    postLocationSource: cleanString(row.post_location_source) || null,
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
      engagement: null,
    },
  };
};

const resolveNativeSocialAvatarUrl = async (value: unknown) => {
  const raw = cleanString(value);
  if (!raw) return null;
  return resolveNativeProfileImageUrlAsync(raw, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null);
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

  const [{ data, error }, engagementByUserId] = await Promise.all([
    nativeExactTokenRpc("get_social_feed_hydration", { p_thread_ids: ids }, accessToken),
    fetchNativeEngagementTiers(rows.map((row) => row.userId), accessToken),
  ]);

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
      hasAlertLink: Boolean((cleanString(hydration.map_id) || thread.mapId) && (hydration.has_alert_link === true || thread.hasAlertLink)),
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
        engagement: engagementByUserId.get(thread.userId) ?? thread.author.engagement ?? null,
      },
    };
  });

  return resolveNativeSocialThreadAvatarUrls(hydrated);
}

async function hydrateNativeSocialThreadImageMetadata(rows: NativeSocialThread[], accessToken?: string | null): Promise<NativeSocialThread[]> {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return rows;
  const { data, error } = await nativeExactTokenRpc<Array<{ thread_id?: string | null; image_metadata?: unknown }>>(
    "get_native_social_thread_image_metadata",
    { p_thread_ids: ids },
    accessToken,
  );
  if (error || !Array.isArray(data)) return rows;
  const byThreadId = new Map(data.map((row) => [String(row.thread_id || ""), row.image_metadata]));
  return rows.map((row) => (
    byThreadId.has(row.id)
      ? { ...row, imageMetadata: parseNativeSocialImageMetadata(byThreadId.get(row.id), row.images) }
      : row
  ));
}

async function hydrateNativeSocialCommentImageMetadata(comments: NativeSocialComment[], accessToken?: string | null): Promise<NativeSocialComment[]> {
  const ids = comments.map((comment) => comment.id).filter((id) => id && !id.startsWith("pending:"));
  if (ids.length === 0) return comments;
  const data = await nativeSocialRpc<Array<{ comment_id?: string | null; image_metadata?: unknown }>>(
    "get_native_social_comment_image_metadata",
    { p_comment_ids: ids },
    accessToken,
  ).catch(() => null);
  if (!Array.isArray(data)) return comments;
  const byCommentId = new Map(data.map((row) => [String(row.comment_id || ""), row.image_metadata]));
  return comments.map((comment) => (
    byCommentId.has(comment.id)
      ? { ...comment, imageMetadata: parseNativeSocialImageMetadata(byCommentId.get(comment.id), comment.images) }
      : comment
  ));
}

export async function fetchNativeSocialFeedPage(options: {
  viewerId: string;
  accessToken?: string | null;
  sortMode: NativeSocialSortMode;
  cursor?: NativeSocialFeedCursor | null;
  limit?: number;
  viewerScope?: NativeViewerScope | null;
}): Promise<NativeSocialFeedPage> {
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? DEFAULT_SOCIAL_FEED_PAGE_LIMIT), 25));
  // Fetch one look-ahead row so `hasMore` is authoritative for the page we return.
  // An exact-size terminal page must not advertise another page and make the UI
  // show a loader for an empty follow-up request.
  const fetchLimit = Math.min(limit + 1, 25);
  const scopePoint = options.viewerScope?.primaryPoint ?? null;
  const profilePoint = options.viewerScope?.profilePoint ?? null;
  const params = {
    p_viewer_id: options.viewerId,
    p_sort: options.sortMode === "Saves" ? "Latest" : options.sortMode,
    p_limit: fetchLimit,
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
      profileCountry: options.viewerScope.profileCountry ?? null,
      profileCountryCode: options.viewerScope.profileCountryCode ?? null,
      profileCountryName: options.viewerScope.profileCountryName ?? null,
      profileDistrict: options.viewerScope.profileDistrict ?? null,
      profileLat: profilePoint?.lat ?? null,
      profileLng: profilePoint?.lng ?? null,
      profileLocationName: options.viewerScope.profileLocationName ?? null,
      source: options.viewerScope.source,
      sourceConsistent: options.viewerScope.sourceConsistent,
    } : null,
  };
  const { data, error } = await nativeExactTokenRpc("get_social_feed", params, options.accessToken);
  if (error) throw error;
  const fetchedRows = (Array.isArray(data) ? data : []).map((row) => mapNativeSocialFeedRow(row as Record<string, unknown>));
  const baseRows = fetchedRows.slice(0, limit);
  const rowsWithMedia = await hydrateNativeSocialThreadImageMetadata(baseRows, options.accessToken);
  const rows = await hydrateNativeSocialRows(rowsWithMedia, options.accessToken).catch((error) => {
    if (__DEV__) console.warn("NATIVE_SOCIAL_HYDRATION_NON_FATAL", { message: String((error as { message?: unknown })?.message || error) });
    return resolveNativeSocialThreadAvatarUrls(rowsWithMedia);
  });
  return {
    rows,
    hasMore: fetchedRows.length > limit,
    cursor: buildNativeSocialCursor(rows[rows.length - 1] ?? baseRows[baseRows.length - 1]),
  };
}

export async function fetchNativeSocialThreadById(threadId: string, accessToken?: string | null): Promise<NativeSocialThread | null> {
  if (!threadId) return null;
  const { data, error } = await nativeExactTokenRpc("get_native_social_thread_by_id", { p_thread_id: threadId }, accessToken);
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const baseRow = mapNativeSocialFeedRow(row as Record<string, unknown>);
  const [rowWithMedia] = await hydrateNativeSocialThreadImageMetadata([baseRow], accessToken);
  const [hydrated] = await hydrateNativeSocialRows([rowWithMedia || baseRow], accessToken).catch(() => resolveNativeSocialThreadAvatarUrls([rowWithMedia || baseRow]));
  return hydrated || null;
}

export async function loadNativeBlockedSocialUserIds(userId: string, accessToken?: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
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
  imageMetadata: parseNativeSocialImageMetadata(row.image_metadata, isStringArray(row.images) ? row.images : []),
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
    engagement: null,
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
  const comments = await hydrateNativeSocialCommentImageMetadata((Array.isArray(data) ? data : []).map((row) => mapNativeSocialCommentRow(row, threadId)), options.accessToken);
  const engagementByUserId = await fetchNativeEngagementTiers(comments.map((comment) => comment.userId), options.accessToken);
  return Promise.all(comments.map(async (comment) => ({
    ...comment,
    author: {
      ...comment.author,
      avatarUrl: await resolveNativeSocialAvatarUrl(comment.author.avatarUrl),
      engagement: engagementByUserId.get(comment.userId) ?? null,
    },
  })));
}

export async function uploadNativeSocialImage(userId: string, media: NativeSocialComposerMedia, scope: "thread" | "reply" | "report" | "review", accessToken?: string | null, sessionKey?: string | null): Promise<string> {
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  const token = await getFreshNativeAccessToken(session.accessToken);
  if (!token) throw new Error("auth_required");
  const info = await FileSystem.getInfoAsync(media.uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const path = `${session.userId}/${scope}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  // Library-picked photos can be 10MP+; base64-encoding the raw file synchronously freezes
  // the JS thread for several seconds (an app hang). Resize/compress first, matching every
  // other native upload path (care evidence, broadcast alerts, profile photos).
  const normalized = await manipulateAsync(media.uri, [{ resize: { width: 1600 } }], { compress: 0.86, format: SaveFormat.JPEG });
  let body: ReturnType<typeof base64ToUint8Array>;
  try {
    const base64 = await FileSystem.readAsStringAsync(normalized.uri, { encoding: FileSystem.EncodingType.Base64 });
    body = base64ToUint8Array(base64);
    if (body.byteLength === 0) throw new Error("Selected image is empty.");
  } finally {
    if (normalized.uri !== media.uri && normalized.uri.startsWith("file://")) {
      await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
  const response = await fetch(`${supabaseUrl}/storage/v1/object/notices/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "cache-control": "3600",
      "content-type": "image/jpeg",
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

export type NativeServiceChatAttachmentStorageRef = {
  bucket: "care_attachments";
  mime: string;
  name: string;
  path: string;
  size: number | null;
};

export async function uploadNativeServiceChatAttachmentImage(options: {
  accessToken?: string | null;
  chatRoomId: string;
  media: NativeSocialComposerMedia;
  sessionKey?: string | null;
  uploadGroupId: string;
  userId: string;
}): Promise<NativeServiceChatAttachmentStorageRef> {
  const session = requireNativeSocialSession({
    accessToken: options.accessToken,
    sessionKey: options.sessionKey,
    userId: options.userId,
  });
  const token = await getFreshNativeAccessToken(session.accessToken);
  if (!token) throw new Error("auth_required");
  const chatRoomId = String(options.chatRoomId || "").trim();
  const uploadGroupId = String(options.uploadGroupId || "").trim().replace(/[^a-zA-Z0-9:_-]/g, "");
  if (!chatRoomId || !uploadGroupId) throw new Error("missing_service_chat_attachment_scope");
  const info = await FileSystem.getInfoAsync(options.media.uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const ext = "jpg";
  const mime = "image/jpeg";
  const path = `${session.userId}/service-chat/${chatRoomId}/${uploadGroupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  // Library-picked photos can be 10MP+; base64-encoding the raw file synchronously freezes
  // the JS thread for several seconds (an app hang). Resize/compress first, matching every
  // other native upload path (care evidence, broadcast alerts, profile photos).
  const normalized = await manipulateAsync(options.media.uri, [{ resize: { width: 1600 } }], { compress: 0.86, format: SaveFormat.JPEG });
  let body: ReturnType<typeof base64ToUint8Array>;
  try {
    const base64 = await FileSystem.readAsStringAsync(normalized.uri, { encoding: FileSystem.EncodingType.Base64 });
    body = base64ToUint8Array(base64);
    if (body.byteLength === 0) throw new Error("Selected image is empty.");
  } finally {
    if (normalized.uri !== options.media.uri && normalized.uri.startsWith("file://")) {
      await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeStorageObjectPath("care_attachments", path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "cache-control": "3600",
      "content-type": mime,
      "x-upsert": "false",
    },
    body,
  });
  if (!response.ok) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      originalError: new Error(`Care chat attachment upload failed (${response.status}).`),
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  }
  try {
    await registerNativeMediaAsset({
      accessToken: token,
      bucket: "care_attachments",
      contentId: chatRoomId,
      contentType: "service_chat_attachment",
      objectPath: path,
    });
  } catch (error) {
    const cleanupResult = await requestNativeStorageCleanupResult("care_attachments", path, "register_service_chat_attachment_failed", token);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  return {
    bucket: "care_attachments",
    mime,
    name: options.media.name || `care-chat.${ext}`,
    path,
    size: options.media.size ?? null,
  };
}

export async function uploadNativeServiceCareEvidenceImage(options: {
  accessToken?: string | null;
  media: NativeSocialComposerMedia;
  scope: "cancellation" | "checkin" | "handoff" | "issue" | "review" | "update";
  serviceChatId: string;
  sessionKey?: string | null;
  userId: string;
}): Promise<string> {
  const NATIVE_SERVICE_CARE_EVIDENCE_UPLOAD_TIMEOUT_MS = 15000;
  const NATIVE_SERVICE_CARE_EVIDENCE_PREP_TIMEOUT_MS = 12000;
  const withCareEvidenceTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(code)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
  const session = requireNativeSocialSession({
    accessToken: options.accessToken,
    sessionKey: options.sessionKey,
    userId: options.userId,
  });
  const token = await getFreshNativeAccessToken(session.accessToken);
  if (!token) throw new Error("auth_required");
  const userId = session.userId;
  const serviceChatId = String(options.serviceChatId || "").trim();
  if (!userId || !serviceChatId) throw new Error("missing_service_care_evidence_context");
  const info = await withCareEvidenceTimeout(FileSystem.getInfoAsync(options.media.uri), NATIVE_SERVICE_CARE_EVIDENCE_PREP_TIMEOUT_MS, "care_update_image_info_timeout");
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const path = `${userId}/service-care/${serviceChatId}/${options.scope}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  // Library-picked photos can be 10MP+; base64-encoding the raw file synchronously froze
  // the JS thread for several seconds (visible as an app hang). Resize/compress first,
  // matching every other native upload path (broadcast alerts, profile photos, identity docs).
  const normalized = await withCareEvidenceTimeout(
    manipulateAsync(options.media.uri, [{ resize: { width: 1600 } }], { compress: 0.86, format: SaveFormat.JPEG }),
    NATIVE_SERVICE_CARE_EVIDENCE_PREP_TIMEOUT_MS,
    "care_update_image_prepare_timeout",
  );
  try {
    const base64 = await withCareEvidenceTimeout(
      FileSystem.readAsStringAsync(normalized.uri, { encoding: FileSystem.EncodingType.Base64 }),
      NATIVE_SERVICE_CARE_EVIDENCE_PREP_TIMEOUT_MS,
      "care_update_image_read_timeout",
    );
    const body = base64ToUint8Array(base64);
    if (body.byteLength === 0) throw new Error("Selected image is empty.");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NATIVE_SERVICE_CARE_EVIDENCE_UPLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeStorageObjectPath("service_care_evidence", path)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          "cache-control": "3600",
          "content-type": "image/jpeg",
          "x-upsert": "false",
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      throw createNativeProtectedActionError({
        ok: false,
        stage: "upload",
        originalError: controller.signal.aborted ? new Error("care_update_upload_timeout") : error,
        cleanupAttempted: false,
        cleanupResult: "not_needed",
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw createNativeProtectedActionError({
        ok: false,
        stage: "upload",
        originalError: new Error(`Care evidence upload failed (${response.status}).`),
        cleanupAttempted: false,
        cleanupResult: "not_needed",
      });
    }
  } finally {
    if (normalized.uri !== options.media.uri && normalized.uri.startsWith("file://")) {
      await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
  try {
    await registerNativeMediaAsset({
      accessToken: token,
      bucket: "service_care_evidence",
      contentId: serviceChatId,
      contentType: `service_care_${options.scope}`,
      objectPath: path,
    });
  } catch (error) {
    const cleanupResult = await requestNativeStorageCleanupResult("service_care_evidence", path, "register_service_care_evidence_failed", token);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  return JSON.stringify({
    bucket: "service_care_evidence",
    mime: "image/jpeg",
    name: options.media.name || `${options.scope}-evidence.jpg`,
    path,
    size: options.media.size ?? null,
  });
}

export async function uploadNativeServiceCareAgreementSignatureImage(options: {
  accessToken?: string | null;
  media: NativeSocialComposerMedia;
  role: "owner" | "provider";
  serviceChatId: string;
  sessionKey?: string | null;
  userId: string;
}): Promise<{ bucket: "care_agreements"; mime: "image/png"; path: string; size: number | null }> {
  const session = requireNativeSocialSession({
    accessToken: options.accessToken,
    sessionKey: options.sessionKey,
    userId: options.userId,
  });
  const token = await getFreshNativeAccessToken(session.accessToken);
  if (!token) throw new Error("auth_required");
  const userId = session.userId;
  const serviceChatId = String(options.serviceChatId || "").trim();
  if (!userId || !serviceChatId) throw new Error("missing_service_care_agreement_context");
  const info = await FileSystem.getInfoAsync(options.media.uri);
  if (!info.exists) throw new Error("Signature image is unavailable.");
  const path = `${userId}/care_agreements/${serviceChatId}/${options.role}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const base64 = await FileSystem.readAsStringAsync(options.media.uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToUint8Array(base64);
  if (body.byteLength === 0) throw new Error("Signature image is empty.");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeStorageObjectPath("care_agreements", path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "cache-control": "31536000",
      "content-type": "image/png",
      "x-upsert": "false",
    },
    body,
  });
  if (!response.ok) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      originalError: new Error(`Care agreement signature upload failed (${response.status}).`),
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  }
  return {
    bucket: "care_agreements",
    mime: "image/png",
    path,
    size: options.media.size ?? null,
  };
}

type NoticeStorageRef = {
  bucket: "notices";
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
    const markers: Array<{ bucket: "notices"; marker: string }> = [
      { bucket: "notices", marker: "/storage/v1/object/public/notices/" },
      { bucket: "notices", marker: "/storage/v1/object/notices/" },
    ];
    for (const { bucket, marker } of markers) {
      const markerIndex = path.indexOf(marker);
      if (markerIndex >= 0) {
        const objectPath = path.slice(markerIndex + marker.length).replace(/^\/+/, "");
        return objectPath ? { bucket, path: objectPath } : null;
      }
    }
    const fallback = path.split("/notices/").pop();
    if (!fallback) return null;
    const normalized = decodeSafe(fallback.replace(/^\/+/, ""));
    if (!normalized) return null;
    return { bucket: "notices", path: normalized };
  } catch {
    const fallback = mediaUrl.split("?")[0].split("/notices/").pop();
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
    return { bucket: "notices", path: normalized };
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
  const bucket = "notices";
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
  sessionKey?: string | null,
) : Promise<NativeProtectedActionCleanupResult> => {
  const ownerPrefix = String(ownerUserId || "").trim();
  if (!ownerPrefix) return "not_needed";
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId: ownerPrefix });
  const refs = urls
    .map((mediaUrl) => extractNoticeStorageRef(mediaUrl))
    .filter((entry): entry is NoticeStorageRef => !!entry && Boolean(entry.path) && entry.path.startsWith(`${ownerPrefix}/`));
  if (refs.length === 0) return "not_needed";
  const uniqueRefs = Array.from(new Map(refs.map((entry) => [`${entry.bucket}:${entry.path}`, entry])).values());
  let cleanupResult: NativeProtectedActionCleanupResult = "not_needed";
  for (const entry of uniqueRefs) {
    const nextResult = await requestNativeStorageCleanupResult(entry.bucket, entry.path, reason, session.accessToken);
    if (nextResult === "failed") cleanupResult = "failed";
    else if (nextResult === "deleted" && cleanupResult === "not_needed") cleanupResult = "deleted";
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

export async function createNativeSocialVideoUpload(userId: string, media: NativeSocialComposerMedia, title: string, accessToken?: string | null, sessionKey?: string | null) {
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  if (Number(media.durationSeconds ?? 0) > SOCIAL_VIDEO_MAX_SECONDS + 0.5) {
    throw new Error("Video must be trimmed to 15 seconds before upload.");
  }
  const file = await readNativeLocalMediaFile(media.uri, { fileName: media.name, mimeType: media.mimeType }, { fallbackContentType: "video/mp4", fallbackExtension: "mp4" });
  const tus = await import("tus-js-client");
  const blob = new Blob([file.body], { type: file.contentType || media.mimeType || "video/mp4" });
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
    fileType: file.contentType || media.mimeType || "video/mp4",
    fileSize: Number(media.size || file.size || blob.size || 0),
  }, session.accessToken);
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
        filetype: file.contentType || media.mimeType || "video/mp4",
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
    session.accessToken,
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
  imageMetadata?: NativeSocialImageMetadata[];
  images: string[];
  isSensitive: boolean;
  postLanguage?: string | null;
  postScope?: NativeViewerScope | null;
  sessionKey?: string | null;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
}) {
  const session = requireNativeSocialSession(args);
  const scopePoint = args.postScope?.primaryPoint ?? null;
  const data = await nativeSocialRpc<{ id?: string | null } | string>("create_native_social_thread", {
    p_title: args.title,
    p_content: args.content,
    p_category: args.category || "Social",
    p_images: args.images,
    p_image_metadata: args.imageMetadata ?? [],
    p_is_sensitive: args.isSensitive,
    p_post_language: args.postLanguage ?? null,
    p_post_scope: args.postScope ? {
      city: args.postScope.city ?? null,
      country: args.postScope.country ?? null,
      countryCode: args.postScope.countryCode ?? null,
      countryName: args.postScope.countryName ?? null,
      district: args.postScope.district ?? null,
      lat: scopePoint?.lat ?? null,
      lng: scopePoint?.lng ?? null,
      source: args.postScope.source,
    } : null,
    p_video: args.video ?? null,
  }, session.accessToken);
  return typeof data === "string" ? data : String(data?.id || "");
}

export async function updateNativeSocialThread(args: {
  accessToken?: string | null;
  category: string;
  content: string;
  id: string;
  imageMetadata?: NativeSocialImageMetadata[];
  images?: string[];
  isSensitive: boolean;
  postLanguage?: string | null;
  sessionKey?: string | null;
  title: string;
  userId: string;
  video?: Awaited<ReturnType<typeof createNativeSocialVideoUpload>> | null;
  previousImages?: string[];
}) {
  const session = requireNativeSocialSession(args);
  const nextImages = Array.isArray(args.images) ? args.images.map((url) => normalizeNoticeImageUrl(url)).filter((url): url is string => Boolean(url)) : undefined;
  const removedImageUrls = computeRemovedNoticeImageUrls(args.previousImages, nextImages);
  const data = await nativeSocialRpc<{ id?: string | null } | string>("update_native_social_thread", {
    p_thread_id: args.id,
    p_title: args.title,
    p_content: args.content,
    p_category: args.category || "Social",
    p_images: nextImages ?? null,
    p_image_metadata: args.imageMetadata ?? null,
    p_is_sensitive: args.isSensitive,
    p_post_language: args.postLanguage ?? null,
    p_video: args.video ?? null,
  }, session.accessToken);
  const updatedId = typeof data === "string" ? data : data?.id;
  if (!updatedId) throw new Error("Unable to update post.");
  if (removedImageUrls.length > 0) {
    void cleanupNativeSocialStorageImages(removedImageUrls, session.userId, session.accessToken, "update_social_thread_removed_media", session.sessionKey).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[social.update_thread_removed_media_cleanup.failed]", {
          threadId: args.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    });
  }
}

export async function deleteNativeSocialThread(thread: NativeSocialThread, userId: string, accessToken?: string | null, sessionKey?: string | null): Promise<boolean> {
  if (!thread.id || !userId) return false;
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  const data = await nativeSocialRpc<unknown>("delete_social_thread", { p_thread_id: thread.id }, session.accessToken);
  const deleted = data === true || (typeof data === "object" && data !== null && (data as { deleted?: boolean }).deleted === true);
  if (deleted && thread.images.length > 0) {
    void cleanupNativeSocialStorageImages(thread.images, session.userId, session.accessToken, "delete_social_thread", session.sessionKey).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[social.delete_thread_media_cleanup.failed]", {
          threadId: thread.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    });
  }
  if (thread.providerVideoId) {
    void deleteNativeSocialVideo(thread.providerVideoId, session.accessToken).catch((videoError) => {
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
  imageMetadata?: NativeSocialImageMetadata[];
  images: string[];
  parentCommentId?: string | null;
  sessionKey?: string | null;
  threadId: string;
  userId: string;
}) {
  const session = requireNativeSocialSession(args);
  const data = await nativeSocialRpc<{ id?: string | null } | string>("create_native_social_comment", {
    p_thread_id: args.threadId,
    p_parent_comment_id: args.parentCommentId || null,
    p_content: args.content,
    p_images: args.images,
    p_image_metadata: args.imageMetadata ?? [],
  }, session.accessToken);
  return typeof data === "string" ? data : String(data?.id || "");
}

export async function updateNativeSocialComment(commentId: string, userId: string, content: string, images?: string[] | null, previousImages?: string[] | null, accessToken?: string | null, sessionKey?: string | null, imageMetadata?: NativeSocialImageMetadata[] | null) {
  if (!commentId || !userId) throw new Error("Reply is unavailable.");
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  const nextImages = Array.isArray(images)
    ? images.map((url) => normalizeNoticeImageUrl(url)).filter((url): url is string => Boolean(url))
    : null;
  const removedImageUrls = computeRemovedNoticeImageUrls(previousImages ?? undefined, nextImages ?? undefined);
  await nativeSocialRpc("update_native_social_comment", {
    p_comment_id: commentId,
    p_content: content,
    p_images: nextImages,
    p_image_metadata: imageMetadata ?? null,
  }, session.accessToken);
  if (removedImageUrls.length > 0) {
    void cleanupNativeSocialStorageImages(removedImageUrls, session.userId, session.accessToken, "update_social_comment_removed_media", session.sessionKey).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[social.update_comment_removed_media_cleanup.failed]", {
          commentId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    });
  }
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
      updatedAt: cleanString(row.updated_at) || null,
    }))
    .filter((entry) => {
      if (!entry.userId || !entry.socialId || seen.has(entry.userId)) return false;
      seen.add(entry.userId);
      return true;
    })
    .slice(0, 10);
}

export async function createNativeSocialMentionNotifications(threadId: string, actorId: string, mentionedUserIds: string[], accessToken?: string | null, sessionKey?: string | null) {
  const uniqueIds = Array.from(new Set(mentionedUserIds.filter(Boolean)));
  if (!threadId || !actorId || uniqueIds.length === 0) return;
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId: actorId });
  await nativeSocialRpc("create_thread_mention_notifications", {
    p_actor_id: session.userId,
    p_thread_id: threadId,
    p_recipient_ids: uniqueIds,
  }, session.accessToken);
}

export async function upsertNativeSocialNotificationWindow(args: {
  actorId: string;
  actorName: string;
  category: "social";
  href: string;
  kind: "comment" | "comment_like" | "like" | "reply";
  ownerUserId: string;
  subjectId: string;
  subjectType: "comment" | "thread";
  accessToken?: string | null;
  sessionKey?: string | null;
}) {
  if (!args.ownerUserId || !args.subjectId || !args.actorId) return;
  const session = requireNativeSocialSession({ accessToken: args.accessToken, sessionKey: args.sessionKey, userId: args.actorId });
  await nativeSocialRpc("upsert_notification_window", {
    p_actor_id: session.userId,
    p_actor_name: args.actorName,
    p_category: args.category,
    p_href: args.href,
    p_kind: args.kind,
    p_owner_user_id: args.ownerUserId,
    p_subject_id: args.subjectId,
    p_subject_type: args.subjectType,
  }, session.accessToken);
}

export async function deleteNativeSocialComment(commentId: string, commentImages: string[], userId: string, accessToken?: string | null, sessionKey?: string | null) {
  if (!commentId || !userId) throw new Error("Reply is unavailable.");
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  const data = await nativeSocialRpc<{ deleted?: boolean } | boolean>("delete_native_social_comment", { p_comment_id: commentId }, session.accessToken);
  const deleted = data === true || (typeof data === "object" && data !== null && data.deleted === true);
  if (deleted && commentImages.length > 0) {
    void cleanupNativeSocialStorageImages(commentImages, session.userId, session.accessToken, "delete_social_comment", session.sessionKey).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[social.delete_comment_media_cleanup.failed]", {
          commentId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    });
  }
  return deleted;
}

export async function updateNativeSupportedSocialThreadCache(userId: string, threadId: string, supported: boolean) {
  if (!userId || !threadId) return;
  const cached = await readSocialSupportedThreadsCache(userId) ?? new Set<string>();
  if (supported) cached.add(threadId);
  else cached.delete(threadId);
  await writeSocialSupportedThreadsCache(userId, cached);
}

export async function setNativeSocialSupport(thread: NativeSocialThread, userId: string, supported: boolean, accessToken?: string | null, sessionKey?: string | null) {
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  if (__DEV__) console.log("NATIVE_SOCIAL_SUPPORT_RPC_START", {
    hasAccessToken: Boolean(session.accessToken),
    supportedBefore: supported,
    threadId: thread.id,
  });
  let data: { support_count?: number | null } | number;
  try {
    data = await nativeSocialRpc<{ support_count?: number | null } | number>("set_native_social_support", {
      p_thread_id: thread.id,
      p_supported_before: supported,
    }, session.accessToken);
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
  const cached = await readSocialSupportedThreadsCache(session.userId) ?? new Set<string>();
  if (supported) cached.delete(thread.id);
  else cached.add(thread.id);
  await writeSocialSupportedThreadsCache(session.userId, cached);
  return typeof data === "number" ? data : Number(data?.support_count ?? 0);
}

export async function setNativeSocialCommentSupport(commentId: string, supported: boolean, accessToken?: string | null, userId?: string | null, sessionKey?: string | null) {
  if (!commentId) throw new Error("Comment is unavailable.");
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_SUPPORT_RPC_START", {
    commentId,
    hasAccessToken: Boolean(session.accessToken),
    nextSupported: supported,
  });
  let data: { support_count?: number | null; supported?: boolean | null } | Array<{ support_count?: number | null; supported?: boolean | null }>;
  try {
    data = await nativeSocialRpc<
      { support_count?: number | null; supported?: boolean | null } | Array<{ support_count?: number | null; supported?: boolean | null }>
    >("set_native_social_comment_support", {
      p_comment_id: commentId,
      p_supported: supported,
    }, session.accessToken);
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

export async function blockNativeSocialUser(authorId: string, accessToken?: string | null, userId?: string | null, sessionKey?: string | null) {
  const session = requireNativeSocialSession({ accessToken, sessionKey, userId });
  await nativeSocialRpc("block_user", { p_blocked_id: authorId }, session.accessToken);
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
  sessionKey?: string | null;
}) {
  const session = requireNativeSocialSession({ accessToken: args.accessToken, sessionKey: args.sessionKey, userId: args.reporterId });
  const data = await nativeSocialRpc<unknown>("process_user_report", {
    p_target_id: args.targetUserId,
    p_categories: args.categories,
    p_details: args.details,
    p_attachment_urls: args.attachmentUrls ?? [],
    p_source: args.sourceOrigin ?? "social",
  }, session.accessToken);
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
    }, session.accessToken);
  }
  void nativeSocialFunctionRequest("support-request", {
      subject: `Report: ${args.targetName || args.targetUserId}`,
      message: JSON.stringify({
        target_user_id: args.targetUserId,
        categories: args.categories,
        other: args.other || "",
        details: args.details || "",
        attachments: args.attachmentUrls ?? [],
      }),
      source: args.source ?? "Social",
  }, session.accessToken).catch(() => undefined);
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
  return normalizeNativeSocialShareTargetsForDisplay(Array.isArray(data) ? data : []);
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
  const inFlightKey = `${accessToken ? "auth" : "anon"}:${url}`;
  const existing = nativeSocialLinkPreviewInFlight.get(inFlightKey);
  if (existing) return existing;
  const request = (async () => {
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
  })().finally(() => {
    if (nativeSocialLinkPreviewInFlight.get(inFlightKey) === request) nativeSocialLinkPreviewInFlight.delete(inFlightKey);
  });
  nativeSocialLinkPreviewInFlight.set(inFlightKey, request);
  return request;
}

export async function fetchNativeSocialLinkPreviews(urls: string[], accessToken?: string | null): Promise<Record<string, NativeSocialLinkPreview>> {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
  if (uniqueUrls.length === 0) return {};

  const stored = await readNativeStoredLinkPreviewMap();
  const next: Record<string, NativeSocialLinkPreview> = {};
  uniqueUrls.forEach((url) => {
    const intrinsicPreview = buildNativeSocialIntrinsicLinkPreview(url);
    if (intrinsicPreview) {
      next[url] = intrinsicPreview;
      return;
    }
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
