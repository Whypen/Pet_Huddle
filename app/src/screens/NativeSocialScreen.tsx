import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { openNativeShareSheet } from "../lib/nativeShareSheet";
import { readNativeDisplayCacheItem, readNativeDisplayCacheKeys } from "../lib/nativeDisplayCacheStorage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { launchNativeImageLibraryAsync } from "../lib/nativeMediaPermissions";
import { Fragment, createRef, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,

  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type GestureResponderEvent,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";

// SO11: enable LayoutAnimation on Android for reply branch expand/collapse
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { normalizeQuotaTier } from "../lib/quotaConfig_v1";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeNavIcon } from "../components/NativeNavIcons";
import { NativeShimmerSkeleton } from "../components/NativeShimmerSkeleton";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeToast, NATIVE_TOAST_DURATION_MS } from "../components/NativeToast";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeSocialEmptyState, NativeSocialExternalLinkPreview, NativeSocialFeedCard, NativeSocialFilterBar, NativeSocialMediaCarousel } from "../components/social/NativeSocialFeedPrimitives";
import { NativeSocialReplyComposerInput } from "../components/social/NativeSocialReplyComposerInput";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { buildNativeReplyTree, type NativeSocialThreadedReply } from "../components/social/nativeSocialReplyTree";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppDestructiveSlideConfirm, AppKeyboardAvoidingView as KeyboardAvoidingView, AppModalActionRow, AppModalButton, AppModalCard, AppModalCloseButton, AppModalScroll, SlideToConfirm } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { haptic } from "../lib/nativeHaptics";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { isReduceMotionActive } from "../lib/nativeReduceMotion";
import { applyNavMinimizeFromOffset, setNavMinimized } from "../lib/nativeNavScroll";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { NATIVE_SOCIAL_VIDEO_MAX_BYTES } from "../lib/nativeMediaPolicy";
import {
  averageNativeUploadProgress,
  NATIVE_UPLOAD_PROGRESS_START,
  nextNativeUploadProgress,
} from "../lib/nativeUploadProgress";
import { useErrorShake } from "../components/motion/useErrorShake";
import { navigateNativeHuddleLink } from "../lib/nativeInternalLinks";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { nativeSocialRealtimeTopic } from "../lib/nativeSocialRealtime";
import { fetchNativeProfileSummary, subscribeNativeProfileSummary } from "../lib/nativeProfileSummary";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import { readCachedNativeViewerScope, resolveNativeViewerScope, subscribeNativeViewerScope, type NativeViewerScope } from "../lib/nativeViewerScope";
import {
  areNativeSocialUsersBlocked,
  blockNativeSocialUser,
  buildNativeSocialSharePayload,
  buildNativeSocialCursor,
  buildNativeSocialImageMetadata,
  createNativeSocialMentionNotifications,
  createNativeSocialComment,
  createNativeSocialThread,
  createNativeSocialVideoUpload,
  cleanupNativeSocialStorageImages,
  deleteNativeSocialComment,
  deleteNativeSocialThread,
  extractCompletedNativeSocialPreviewUrl,
  extractNativeSocialFirstHttpUrl,
  formatNativeShareChatActionLabel,
  fetchNativeSocialComments,
  fetchNativeSocialThreadCounts,
  fetchNativeSocialFeedPage,
  fetchNativeSocialLinkPreviews,
  fetchNativeSocialPostPreferences,
  fetchNativeSocialShareTargets,
  fetchNativeSocialThreadById,
  loadNativeBlockedSocialUserIds,
  loadNativeSupportedSocialThreadIds,
  persistNativeSocialPostMentions,
  persistNativeSocialReplyMentions,
  replaceNativeSocialReplyMentions,
  readNativeSocialStoredState,
  recordNativeSocialFeedEvent,
  recordNativeSocialShare,
  searchNativeSocialMentionSuggestions,
  sendNativeSocialShareToChat,
  setNativeSocialCommentSupport,
  setNativeSocialPostPinned,
  setNativeSocialPostSaved,
  setNativeSocialSupport,
  stripNativeSocialExternalUrlFromText,
  updateNativeSupportedSocialThreadCache,
  resolveNativeSocialMentionsFromText,
  upsertNativeSocialNotificationWindow,
  updateNativeSocialComment,
  updateNativeSocialThread,
  uploadNativeSocialImage,
  writeNativeSocialStoredState,
  type NativeSocialAuthor,
  type NativeSocialComment,
  type NativeSocialComposerMedia,
  type NativeSocialFeedCursor,
  type NativeSocialLinkPreview,
  type NativeSocialMentionEntry,
  type NativeSocialMentionSuggestion,
  type NativeSocialShareTarget,
  type NativeSocialSortMode,
  type NativeSocialThread,
} from "../lib/nativeSocial";
import { fetchNativeMapAlertById } from "../lib/nativeMapData";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../lib/nativeStorageCleanup";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleFormFields,
  huddleGlassControls,
  huddleLayout,
  huddleMotion,
  huddleRadii,
  huddleShadows,
  huddleSocial,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeSocialScreenProps = {
  active?: boolean;
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string | null;
  search?: string;
  onBottomSheetOpenChange?: (open: boolean) => void;
  onNavigate: (path: string) => void;
  onScrollTopRef?: React.MutableRefObject<(() => void) | null>;
};

type StoredSets = {
  saved: Set<string>;
  pinned: Set<string>;
  pinnedAt: Map<string, string>;
  source: "cache" | "db";
  status: "hydrating" | "fresh";
};

type VisibleProfileFallbackData = {
  id: string;
  display_name?: string | null;
  social_id?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean;
  non_social?: boolean;
  location_name?: string | null;
  updated_at?: string | null;
  last_active_at?: string | null;
};

const socialAuthorToPublicProfileFallback = (
  userId: string | null | undefined,
  author?: Partial<NativeSocialAuthor> | null,
): VisibleProfileFallbackData | null => {
  const id = String(userId || "").trim();
  if (!id) return null;
  return {
    id,
    display_name: author?.displayName ?? author?.socialId ?? null,
    social_id: author?.socialId ?? null,
    avatar_url: author?.avatarUrl ?? null,
    is_verified: author?.isVerified === true || String(author?.verificationStatus || "").toLowerCase() === "verified",
    non_social: false,
    location_name: author?.locationCountry ?? null,
  };
};

type NativeActionMenuAnchor = { x: number; y: number } | null;

type NativeSocialComposerUploadMedia = NativeSocialComposerMedia & {
  error?: string | null;
  progress?: number;
  status?: "queued" | "uploading" | "uploaded" | "error";
  uploadedUrl?: string | null;
};

const REFRESH_DEBOUNCE_MS = 7000;
const LINK_PREVIEW_DEBOUNCE_MS = 650;
const SOCIAL_EFFECT_DEBOUNCE_MS = 450;
const SOCIAL_REALTIME_REFRESH_COOLDOWN_MS = 1000;
// Below this scroll offset the reader is treated as "at the top", so new posts are
// merged in silently instead of being offered behind a pill.
const NEW_POSTS_AUTO_MERGE_OFFSET = 48;

const SOCIAL_FEED_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_COMMENTS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_SCOPE_FALLBACK_MS = 2500;
const SOCIAL_INITIAL_FEED_LIMIT = 8;
const SOCIAL_MORE_FEED_LIMIT = 12;
const SOCIAL_FEED_CACHE_ROW_LIMIT = 12;
const SOCIAL_FEED_ENTRY_REUSE_MS = 30 * 1000;
const SOCIAL_INITIAL_COMMENT_LIMIT = 5;
const SOCIAL_OLDER_COMMENT_LIMIT = 10;
const nativeSocialScreenSessionKey = (userId: string | null, sessionKey?: string | null) =>
  String(sessionKey || (userId ? `${userId}:0` : "anon:0"));

const nativeSocialCommentsCacheKey = (userId: string, sessionKey: string, thread: Pick<NativeSocialThread, "id" | "commentCount" | "createdAt" | "updatedAt">) =>
  `native-social-comments:v4:${userId}:${sessionKey}:${thread.id}:${thread.commentCount}:${thread.updatedAt || thread.createdAt}`;
const nativeSocialFeedCacheKey = (userId: string, sessionKey: string, country: string | null, sortMode: string) =>
  `native-social-feed:v5:${userId}:${sessionKey}:${country || "global"}:${sortMode}`;
// Scope-independent boot snapshot. Written by the boot warm and read on mount with no
// dependency on viewer-scope resolution, so the feed paints instantly (Threads-fast)
// even before scope is known. The scoped cache + network load reconcile right after.
const nativeSocialBootFeedCacheKey = (userId: string, sessionKey: string) =>
  `native-social-feed-boot:v1:${userId}:${sessionKey}`;
const normalizeSocialScopeCachePart = (value?: string | null) => {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  return clean || null;
};
const nativeSocialFeedScopeCacheKey = (scope?: NativeViewerScope | null) => {
  const currentCountry = normalizeSocialScopeCachePart(scope?.countryName || scope?.country);
  const profileCountry = normalizeSocialScopeCachePart(scope?.profileCountryName || scope?.profileCountry);
  return `${currentCountry || "global"}:${profileCountry || "profile-global"}`;
};

const readNativeSocialPersistentCache = async <T,>(key: string, maxAgeMs: number): Promise<T | null | undefined> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { cachedAt?: number; dbConfirmedAt?: number; source?: string; status?: string; value?: T | null };
    const confirmedAt = typeof parsed.dbConfirmedAt === "number" ? parsed.dbConfirmedAt : parsed.cachedAt;
    if (typeof confirmedAt !== "number" || Date.now() - confirmedAt > maxAgeMs) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    return parsed.value ?? null;
  } catch {
    await AsyncStorage.removeItem(key);
    return undefined;
  }
};

const writeNativeSocialPersistentCache = async <T,>(key: string, value: T | null) => {
  try {
    const dbConfirmedAt = Date.now();
    await AsyncStorage.setItem(key, JSON.stringify({ cachedAt: dbConfirmedAt, dbConfirmedAt, source: "db", status: "fresh", value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const purgeNativeSocialPersistentCache = async (userId: string, options?: { commentsOnlyForThreadId?: string | null }) => {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) return;
  try {
    const keys = await readNativeDisplayCacheKeys();
    const prefixes = [
      `native-social-feed:v5:${cleanUserId}:`,
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
    if (__DEV__) console.log("NATIVE_SOCIAL_CACHE_PURGE", { userId: cleanUserId, count: removals.length, threadId: options?.commentsOnlyForThreadId || null });
  } catch {
    // Cache purge is best-effort; server refresh remains authoritative.
  }
};

export const warmNativeSocialFirstPageCache = async ({
  accessToken,
  sessionKey,
  userId,
  viewerScope,
}: {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string;
  viewerScope?: NativeViewerScope | null;
}) => {
  const cleanUserId = String(userId || "").trim();
  const cacheSessionKey = nativeSocialScreenSessionKey(cleanUserId, sessionKey);
  if (!cleanUserId) return;
  const feedViewerScope = viewerScope ?? null;
  const country = nativeSocialFeedScopeCacheKey(feedViewerScope);
  const page = await fetchNativeSocialFeedPage({
    accessToken,
    // Warm a full screen's worth (cache row limit) rather than the smaller initial
    // page, so the boot-window instant paint fills the viewport instead of a few rows.
    limit: SOCIAL_FEED_CACHE_ROW_LIMIT,
    sortMode: "Latest",
    viewerId: cleanUserId,
    viewerScope: feedViewerScope,
  });
  const warmedSnapshot = {
    rows: page.rows.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
    cursor: page.cursor,
    hasMore: page.hasMore,
  };
  await writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(cleanUserId, cacheSessionKey, country || null, "Latest"), warmedSnapshot);
  // Also persist the scope-independent boot snapshot for instant first paint.
  await writeNativeSocialPersistentCache(nativeSocialBootFeedCacheKey(cleanUserId, cacheSessionKey), warmedSnapshot);
};

const mergeNativeSocialComments = (current: NativeSocialComment[], incoming: NativeSocialComment[]) => {
  const byId = new Map<string, NativeSocialComment>();
  [...current, ...incoming].forEach((comment) => {
    if (comment.id) byId.set(comment.id, { ...(byId.get(comment.id) || {}), ...comment });
  });
  return Array.from(byId.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

const applyCommentSupportState = (
  comments: NativeSocialComment[],
  commentId: string,
  supported: boolean,
  supportCount?: number,
) => comments.map((comment) => (
  comment.id === commentId
    ? {
      ...comment,
      supportCount: typeof supportCount === "number" ? Math.max(0, supportCount) : Math.max(0, comment.supportCount + (supported ? 1 : -1)),
      viewerSupported: supported,
    }
    : comment
));

const isPendingSocialId = (id: string) => id.startsWith("pending:");

// nativeExactTokenRpc rejects with a plain { code, message, status } object rather
// than an Error, so String(error) yields "[object Object]" and hides the cause.
const describeNativeSocialError = (error: unknown) => {
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown; status?: unknown };
    return {
      code: record.code ? String(record.code) : null,
      message: record.message ? String(record.message) : JSON.stringify(error),
      status: typeof record.status === "number" ? record.status : null,
    };
  }
  return { message: String(error) };
};

// Optimistic rows are local-only. Persisting them lets a pending id survive into the
// next session, where it re-enters state alongside a fresh copy and collides on key.
const withoutPendingSocialComments = (comments: NativeSocialComment[]) =>
  comments.filter((comment) => !isPendingSocialId(comment.id));

const dedupeNativeSocialComments = (comments: NativeSocialComment[]) => {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    if (!comment.id || seen.has(comment.id)) return false;
    seen.add(comment.id);
    return true;
  });
};

let nativeSocialOptimisticCounter = 0;
const nextOptimisticCommentId = () => {
  nativeSocialOptimisticCounter += 1;
  return `pending:comment:${Date.now()}:${nativeSocialOptimisticCounter}`;
};

const MAX_COMPOSER_WORDS = 500;
const MAX_COMPOSER_MEDIA = 10;
const SOCIAL_COMPOSER_TEXTAREA_HEIGHT = huddleType.labelLine * 4;
const DELETE_THREAD_TIMEOUT_MS = 12000;
const MIN_THREAD_MEDIA_ASPECT = 9 / 16;
const MAX_THREAD_MEDIA_ASPECT = 1.91;
const COMMENT_SNAP_DELAY_MS = 80;
const COMMENT_SNAP_INTENT_TTL_MS = 600;
const SOCIAL_TAGS = ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"];
const SOCIAL_TAG_ALIASES: Record<string, string[]> = {
  Events: ["Events", "Meetup"],
  Market: ["Market", "Marketplace"],
};

const isPreviewableExternalUrl = (url: string | null) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return parsed.hostname === "localhost" || parsed.hostname.includes(".");
  } catch {
    return false;
  }
};

type NativeActiveMentionQuery = {
  query: string;
  tokenStart: number;
  tokenEnd: number;
};

const getViewNodeRef = (
  map: MutableRefObject<Map<string, RefObject<View | null>>>,
  key: string,
): RefObject<View | null> => {
  let ref = map.current.get(key);
  if (!ref) {
    ref = createRef<View>();
    map.current.set(key, ref);
  }
  return ref;
};

const toggleSetValue = (set: Set<string>, value: string) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

const sanitizeSearch = (value?: string) => {
  if (!value) return "";
  try {
    return new URLSearchParams(value.startsWith("?") ? value.slice(1) : value).get("q") || "";
  } catch {
    return "";
  }
};

const parseSocialParams = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return {
    focus: params.get("focus") || params.get("thread") || null,
    mode: params.get("mode") || null,
    profileUser: params.get("profileUser") || null,
  };
};

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const clampThreadMediaAspect = (aspect: number) => Math.min(Math.max(aspect || 1, MIN_THREAD_MEDIA_ASPECT), MAX_THREAD_MEDIA_ASPECT);
const buildNativeReplyFlightKey = (threadId: string, parentCommentId: string | null, content: string, media: NativeSocialComposerMedia[]) => (
  [
    threadId,
    parentCommentId || "root",
    content.trim().replace(/\s+/g, " "),
    media
      .map((item) => `${item.kind}:${item.uri}:${item.width || 0}x${item.height || 0}:${item.size || 0}`)
      .join("|"),
  ].join("::")
);
const composerMediaPreviewAspect = (media: NativeSocialComposerMedia) => clampThreadMediaAspect(
  typeof media.width === "number" && typeof media.height === "number" && media.width > 0 && media.height > 0
    ? media.width / media.height
    : 1,
);

const findNativeActiveMentionQuery = (value: string, caret: number): NativeActiveMentionQuery | null => {
  const prefix = value.slice(0, caret);
  const match = prefix.match(/(?:^|\s)(@([A-Za-z0-9_.-]{0,24}))$/);
  if (!match || typeof match.index !== "number") return null;
  const token = match[1] || "";
  return {
    query: match[2] || "",
    tokenStart: match.index + match[0].length - token.length,
    tokenEnd: caret,
  };
};

const hydrateEditComposerMedia = (thread: NativeSocialThread | null): NativeSocialComposerUploadMedia[] => {
  if (!thread?.images || thread.images.length === 0) return [];
  return thread.images
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url) => {
      const cleanUrl = url.trim();
      const metadata = thread.imageMetadata.find((item) => item.url === cleanUrl);
      return {
        durationSeconds: null,
        height: metadata?.height ?? null,
        kind: "image" as const,
        progress: 100,
        status: "uploaded" as const,
        uri: cleanUrl,
        uploadedUrl: cleanUrl,
        width: metadata?.width ?? null,
      };
    })
    .slice(0, MAX_COMPOSER_MEDIA);
};

const hydrateEditReplyComposerMedia = (comment: NativeSocialComment | null): NativeSocialComposerUploadMedia[] => {
  if (!comment?.images || comment.images.length === 0) return [];
  return comment.images
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url) => {
      const cleanUrl = url.trim();
      const metadata = comment.imageMetadata.find((item) => item.url === cleanUrl);
      return {
        durationSeconds: null,
        height: metadata?.height ?? null,
        kind: "image" as const,
        progress: 100,
        status: "uploaded" as const,
        uri: cleanUrl,
        uploadedUrl: cleanUrl,
        width: metadata?.width ?? null,
      };
    })
    .slice(0, MAX_COMPOSER_MEDIA);
};

const insertNativeMention = (value: string, activeQuery: NativeActiveMentionQuery | null, suggestion: NativeSocialMentionSuggestion) => {
  if (!activeQuery) return value;
  const before = value.slice(0, activeQuery.tokenStart);
  const after = value.slice(activeQuery.tokenEnd);
  const suffix = after.startsWith(" ") || after.length === 0 ? after : ` ${after}`;
  return `${before}@${suggestion.socialId} ${suffix}`.replace(/[ \t]{2,}/g, " ");
};

const extractCompletedComposerPreviewUrl = (value: string) => {
  return extractCompletedNativeSocialPreviewUrl(value);
};

const compactTime = (date: string) => {
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return "now";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const mentionTokenPattern = /(^|[\s(])@([a-zA-Z0-9_.-]{2,30})/g;

const buildComposerMentionEntries = (value: string) => {
  const entries: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  mentionTokenPattern.lastIndex = 0;
  while ((match = mentionTokenPattern.exec(value)) !== null) {
    if (typeof match.index !== "number") continue;
    const token = match[1];
    if (token === undefined) continue;
    const prefixLength = token.length;
    const start = match.index + prefixLength;
    const mentionHandle = match[2] || "";
    if (mentionHandle.length === 0) continue;
    entries.push({ start, end: start + mentionHandle.length + 1 });
  }
  return entries.sort((left, right) => left.start - right.start);
};

const renderReplyComposerLayer = (value: string) => {
  const entries = buildComposerMentionEntries(value);
  if (entries.length === 0) return [value];
  const nodes: ReactNode[] = [];
  let cursor = 0;
  entries.forEach((entry, index) => {
    if (entry.start > cursor) nodes.push(value.slice(cursor, entry.start));
    const label = value.slice(entry.start, entry.end);
    nodes.push(<Text key={`composer-mention-${index}-${entry.start}`} style={styles.replyComposerMentionText}>{label}</Text>);
    cursor = entry.end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
};

function renderNativeSocialCommentText(
  comment: NativeSocialComment,
  onOpenProfile: (userId: string, author?: Partial<NativeSocialAuthor> | null) => void,
  hiddenUrl?: string | null,
  mentionUserIdByHandle?: Map<string, string>,
): ReactNode[] {
  const value = hiddenUrl ? (comment.content || "").replace(hiddenUrl, "").trim() : comment.content || "";
  const mentions = comment.mentions
    .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.end <= value.length)
    .sort((left, right) => left.start - right.start);
  if (mentions.length === 0) {
    const fallbackNodes: ReactNode[] = [];
    const mentionPattern = /@([A-Za-z0-9_.-]+)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(value)) !== null) {
      const handle = match[1]?.toLowerCase();
      const userId = handle ? mentionUserIdByHandle?.get(handle) : null;
      if (!userId) continue;
      if (match.index > cursor) fallbackNodes.push(value.slice(cursor, match.index));
      fallbackNodes.push(
        <Text key={`${comment.id}-fallback-${match.index}`} onPress={() => onOpenProfile(userId)} style={styles.commentMentionText}>
          {match[0]}
        </Text>,
      );
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length) fallbackNodes.push(value.slice(cursor));
    return fallbackNodes.length > 0 ? fallbackNodes : [value];
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  mentions.forEach((entry, index) => {
    if (entry.start > cursor) nodes.push(value.slice(cursor, entry.start));
    nodes.push(
      <Text key={`${comment.id}-${entry.mentionedUserId}-${index}`} onPress={() => onOpenProfile(entry.mentionedUserId)} style={styles.commentMentionText}>
        {value.slice(entry.start, entry.end)}
      </Text>,
    );
    cursor = entry.end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function NativeSocialCommentMediaCarousel({ comment }: { comment: NativeSocialComment }) {
  const [width, setWidth] = useState(0);
  const images = comment.images;
  if (images.length === 0) return null;

  return (
    <View
      style={styles.replyMediaCarouselWrap}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <NativeSocialMediaCarousel
        contentWidth={Math.max(1, width || 1)}
        items={images.map((uri) => {
          const metadata = comment.imageMetadata.find((item) => item.url === uri);
          return {
            aspectRatio: metadata?.aspectRatio ?? null,
            height: metadata?.height ?? null,
            uri,
            kind: "image" as const,
            width: metadata?.width ?? null,
          };
        })}
        maxFrameHeight={280}
      />
    </View>
  );
}

function NativeSocialCompactReplyQuote({ comment }: { comment: NativeSocialComment }) {
  const image = comment.images[0] || "";
  const authorLabel = comment.author.socialId || comment.author.displayName || "Reply";
  return (
    <View style={styles.replyQuote}>
      {image ? (
        <View style={styles.replyQuoteImageFrame}>
          <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="contain" key={nativeFreshImageKey(image, image)} source={{ uri: nativeFreshImageUri(image, image) }} style={styles.replyQuoteImage as ImageStyle} transition={120} />
        </View>
      ) : null}
      <View style={styles.replyQuoteBodyBlock}>
        <Text numberOfLines={1} style={styles.replyQuoteText}>{authorLabel}</Text>
        <Text numberOfLines={3} style={styles.replyQuoteBody}>{comment.content || "Media reply"}</Text>
      </View>
    </View>
  );
}

function NativeSocialFeedSkeleton() {
  return (
    <View style={styles.feedSkeletonStack} pointerEvents="none">
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.feedSkeletonCard}>
          <View style={styles.feedSkeletonHeader}>
            <NativeShimmerSkeleton style={styles.feedSkeletonAvatar} />
            <View style={styles.feedSkeletonHeaderBody}>
              <NativeShimmerSkeleton style={styles.feedSkeletonName} />
              <NativeShimmerSkeleton style={styles.feedSkeletonMeta} />
            </View>
          </View>
          <NativeShimmerSkeleton style={styles.feedSkeletonTitle} />
          <NativeShimmerSkeleton style={styles.feedSkeletonBodyWide} />
          <NativeShimmerSkeleton style={styles.feedSkeletonBodyNarrow} />
          <View style={styles.feedSkeletonActions}>
            <NativeShimmerSkeleton style={styles.feedSkeletonAction} />
            <NativeShimmerSkeleton style={styles.feedSkeletonAction} />
            <NativeShimmerSkeleton style={styles.feedSkeletonAction} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function NativeSocialScreen({
  active = true,
  accessToken,
  sessionKey,
  userId,
  search,
  onBottomSheetOpenChange,
  onNavigate,
  onScrollTopRef,
}: NativeSocialScreenProps) {
  const wasActiveRef = useRef(active);
  const [threads, setThreads] = useState<NativeSocialThread[]>([]);
  const [query, setQuery] = useState(() => sanitizeSearch(search));
  const [socialControlsHidden, setSocialControlsHidden] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Synchronous mirror of the topic the user has *asked* for. selectedTags lags by one
  // transition (~110ms), so tap handling must compare against this or taps made during
  // a transition are silently dropped. null = "All".
  const categoryTargetRef = useRef<string | null>(null);
  const [sortMode, setSortMode] = useState<NativeSocialSortMode>("Latest");
  const [feedScopeCountry, setFeedScopeCountry] = useState<string | null>(null);
  // True when the server has signalled new posts that this feed has not pulled in
  // yet. Drives the "New posts" pill; nothing is fetched until the reader taps it.
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [viewerScope, setViewerScope] = useState<NativeViewerScope | null>(null);
  const [locationScopeRevision, setLocationScopeRevision] = useState(0);
  const [storedSets, setStoredSets] = useState<StoredSets>({ saved: new Set(), pinned: new Set(), pinnedAt: new Map(), source: "cache", status: "hydrating" });
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [supportedThreadIds, setSupportedThreadIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hiddenThreadIds, setHiddenThreadIds] = useState<Set<string>>(new Set());
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [cursor, setCursor] = useState<NativeSocialFeedCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hideComposeFab, setHideComposeFab] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const feedLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  // Backstop: a loading flag still true past the deadline means something
  // upstream never settled. Fall into this screen's normal retryable error
  // state rather than spinning forever. See useNativeLoadingDeadline.ts.
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      // Invalidate the timed-out attempt before releasing its gate. A late
      // completion can no longer replace the committed feed, and Retry starts
      // a genuinely new request instead of rejoining the stalled one.
      requestIdRef.current += 1;
      feedLoadGateRef.current.inFlight = false;
      setLoading(false);
      setRefreshing(false);
      setRevalidating(false);
      setLoadingMore(false);
      setError("Unable to load Social right now.");
    },
  });

  const [composerOpen, setComposerOpen] = useState(false);
  const [moreThread, setMoreThread] = useState<NativeSocialThread | null>(null);
  const [moreThreadAnchor, setMoreThreadAnchor] = useState<NativeActionMenuAnchor>(null);
  const [reportThread, setReportThread] = useState<NativeSocialThread | null>(null);
  const [shareThread, setShareThread] = useState<NativeSocialThread | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileFallbackData, setProfileFallbackData] = useState<VisibleProfileFallbackData | null>(null);

  const [editingThread, setEditingThread] = useState<NativeSocialThread | null>(null);
  const [commentsByThread, setCommentsByThread] = useState<Record<string, NativeSocialComment[]>>({});
  const [commentsLoadingThreads, setCommentsLoadingThreads] = useState<Set<string>>(new Set());
  const [olderCommentsLoadingThreads, setOlderCommentsLoadingThreads] = useState<Set<string>>(new Set());
  const [commentsCanLoadOlderByThread, setCommentsCanLoadOlderByThread] = useState<Record<string, boolean>>({});
  const [commentLoadErrors, setCommentLoadErrors] = useState<Record<string, string>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [expandedCommentBranches, setExpandedCommentBranches] = useState<Set<string>>(new Set());
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyTargetCommentId, setReplyTargetCommentId] = useState<string | null>(null);
  const [replyComposerAnchorCommentId, setReplyComposerAnchorCommentId] = useState<string | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(new Set());
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [replyDraft, setReplyDraft] = useState("");
  const [replyMedia, setReplyMedia] = useState<NativeSocialComposerMedia[]>([]);
  const [replySubmittingByThread, setReplySubmittingByThread] = useState<Set<string>>(new Set());
  const [editingComment, setEditingComment] = useState<{ comment: NativeSocialComment; threadId: string } | null>(null);
  const [commentReportTarget, setCommentReportTarget] = useState<NativeSocialComment | null>(null);
  const [moreCommentTarget, setMoreCommentTarget] = useState<{ comment: NativeSocialComment; thread: NativeSocialThread } | null>(null);
  const [moreCommentAnchor, setMoreCommentAnchor] = useState<NativeActionMenuAnchor>(null);
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(null);
  const [deleteThreadTarget, setDeleteThreadTarget] = useState<NativeSocialThread | null>(null);
  const [blockThreadTarget, setBlockThreadTarget] = useState<NativeSocialThread | null>(null);
  const [blockCommentTarget, setBlockCommentTarget] = useState<NativeSocialComment | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [socialRestrictionModalOpen, setSocialRestrictionModalOpen] = useState(false);
  const [isGoldUser, setIsGoldUser] = useState(false);
  const [socialPostingBlocked, setSocialPostingBlocked] = useState(false);
  const [feedScopeResolved, setFeedScopeResolved] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const currentSessionKey = useMemo(() => nativeSocialScreenSessionKey(userId, sessionKey), [sessionKey, userId]);

  const syncCommentSupportFromRows = useCallback((comments: NativeSocialComment[]) => {
    setLikedCommentIds((current) => {
      let changed = false;
      const next = new Set(current);
      comments.forEach((comment) => {
        if (!comment.id) return;
        if (comment.viewerSupported) {
          if (!next.has(comment.id)) {
            next.add(comment.id);
            changed = true;
          }
        } else if (next.delete(comment.id)) {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, []);

  const getActionMenuAnchor = (event: GestureResponderEvent): NativeActionMenuAnchor => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
  });

  const openVisibleProfile = useCallback((nextUserId: string | null | undefined, author?: Partial<NativeSocialAuthor> | null) => {
    const cleanUserId = String(nextUserId || "").trim();
    if (!cleanUserId) return;
    setProfileFallbackData(socialAuthorToPublicProfileFallback(cleanUserId, author));
    setProfileUserId(cleanUserId);
  }, []);

  useEffect(() => {
    const open = composerOpen || moreThread !== null || reportThread !== null || shareThread !== null || profileUserId !== null || commentReportTarget !== null || deleteThreadTarget !== null || blockThreadTarget !== null || blockCommentTarget !== null || moreCommentTarget !== null;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [blockCommentTarget, blockThreadTarget, commentReportTarget, composerOpen, deleteThreadTarget, moreCommentTarget, moreThread, onBottomSheetOpenChange, profileUserId, reportThread, shareThread]);

  const socialSessionKeyRef = useRef(currentSessionKey);
  const feedSessionIdRef = useRef(`feed-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const lastRefreshAtRef = useRef(0);
  const lastScrollOffsetRef = useRef(0);
  const composeFabRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeFabOpacityRef = useRef(new Animated.Value(1));
  const trackedImpressionsRef = useRef<Set<string>>(new Set());
  const trackedDwellRef = useRef<Set<string>>(new Set());
  const dwellTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cursorRef = useRef<NativeSocialFeedCursor | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const sortModeRef = useRef<NativeSocialSortMode>("Latest");
  const listRef = useRef<FlatList<NativeSocialThread> | null>(null);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });
  const threadNodeRefs = useRef<Map<string, RefObject<View | null>>>(new Map());
  const commentPanelNodeRefs = useRef<Map<string, RefObject<View | null>>>(new Map());
  const replyComposerNodeRefs = useRef<Map<string, RefObject<View | null>>>(new Map());
  const commentRowNodeRefs = useRef<Map<string, RefObject<View | null>>>(new Map());
  const focusedThreadIdRef = useRef<string | null>(null);
  const focusedThreadScrollDoneRef = useRef<string | null>(null);
  const focusedThreadHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listViewportRef = useRef<View | null>(null);
  const listHeightRef = useRef(0);
  const carouselGestureActiveRef = useRef(false);
  const keyboardHeightRef = useRef(0);
  const activeComposerThreadIdRef = useRef<string | null>(null);
  const pendingSnapRef = useRef<{ threadId: string; target: "panel" | "composer"; anchorCommentId?: string | null; offset?: number } | null>(null);
  const pendingSnapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replySubmitLocksRef = useRef<Set<string>>(new Set());
  const replyInputRef = useRef<TextInput | null>(null);
  const threadsByIdRef = useRef<Map<string, NativeSocialThread>>(new Map());
  const realtimeThreadRefreshInFlightRef = useRef<Set<string>>(new Set());
  const realtimeThreadRefreshLastAtRef = useRef<Map<string, number>>(new Map());
  const realtimeThreadRefreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Counter reconciliation is coalesced across every thread that changed, so a burst
  // of likes/comments anywhere in the viewport costs exactly one batched query.
  const pendingCountThreadIdsRef = useRef<Set<string>>(new Set());
  const countRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRefreshInFlightRef = useRef(false);
  const realtimeCommentRefreshInFlightRef = useRef<Set<string>>(new Set());
  const realtimeCommentRefreshLastAtRef = useRef<Map<string, number>>(new Map());
  const realtimeCommentRefreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const topicCoverageAttemptRef = useRef<Set<string>>(new Set());
  const socialReportRollbackRef = useRef<null | (() => void)>(null);
  const mutatedThreadIdsRef = useRef<Set<string>>(new Set());
  const removedThreadIdsRef = useRef<Set<string>>(new Set());
  const mutatedCommentIdsByThreadRef = useRef<Map<string, Set<string>>>(new Map());
  const removedCommentIdsByThreadRef = useRef<Map<string, Set<string>>>(new Map());
  const [pullOffset, setPullOffset] = useState(0);
  const [debouncedPreviewUrlsKey, setDebouncedPreviewUrlsKey] = useState("");
  const [debouncedVisibleThreadIdsKey, setDebouncedVisibleThreadIdsKey] = useState("");

  // SO6: expose scroll-to-top callback so parent can trigger it on tab re-press
  useEffect(() => {
    if (onScrollTopRef) {
      onScrollTopRef.current = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    return () => { if (onScrollTopRef) onScrollTopRef.current = null; };
  }, [onScrollTopRef]);

  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  /**
   * Drop the deep-link focus target.
   *
   * `?focus=<id>` pins one post so a notification/share/map cross-post lands on it
   * even when the active topic would filter it out. That injection deliberately
   * bypasses tag filtering, so it MUST be released the moment the user steers the
   * feed themselves — otherwise that single post keeps rendering under every topic
   * for the rest of the session and reads as broken topic filtering.
   */
  const releaseFocusedThread = useCallback(() => {
    if (!focusedThreadIdRef.current && !focusedThreadId) return;
    focusedThreadIdRef.current = null;
    focusedThreadScrollDoneRef.current = null;
    setFocusedThreadId(null);
    setHighlightedThreadId(null);
  }, [focusedThreadId]);

  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);
  useEffect(() => { sortModeRef.current = sortMode; }, [sortMode]);
  useEffect(() => {
    socialSessionKeyRef.current = currentSessionKey;
  }, [currentSessionKey]);
  useEffect(() => { setQuery(sanitizeSearch(search)); }, [search]);
  useEffect(() => {
    threadsByIdRef.current = new Map(threads.map((thread) => [thread.id, thread]));
  }, [threads]);
  useEffect(() => () => {
    if (pendingSnapTimeoutRef.current) clearTimeout(pendingSnapTimeoutRef.current);
    if (focusedThreadHighlightTimerRef.current) clearTimeout(focusedThreadHighlightTimerRef.current);
    realtimeThreadRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    realtimeThreadRefreshTimersRef.current.clear();
    realtimeCommentRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    realtimeCommentRefreshTimersRef.current.clear();
    if (countRefreshTimerRef.current) clearTimeout(countRefreshTimerRef.current);
    countRefreshTimerRef.current = null;
    pendingCountThreadIdsRef.current.clear();
  }, []);

  useEffect(() => {
    setEntryReady(false);
    const frame = requestAnimationFrame(() => setEntryReady(true));
    return () => cancelAnimationFrame(frame);
  }, [currentSessionKey]);

  useEffect(() => {
    if (!entryReady) return;
    const params = parseSocialParams(search);
    if (params.focus) {
      focusedThreadIdRef.current = params.focus;
      focusedThreadScrollDoneRef.current = null;
      setFocusedThreadId(params.focus);
      const requestSessionKey = currentSessionKey;
      void fetchNativeSocialThreadById(params.focus, accessToken).then((thread) => {
        if (socialSessionKeyRef.current !== requestSessionKey) return;
        if (!thread) return;
        setThreads((current) => current.some((item) => item.id === thread.id) ? current : [thread, ...current]);
        if (params.mode === "comments") {
          setExpandedReplies((current) => new Set([...current, thread.id]));
          void loadCommentsForThread(thread);
        }
        if (params.mode === "share") setShareThread(thread);
        if (params.mode === "profile") openVisibleProfile(params.profileUser || thread.userId, params.profileUser && params.profileUser !== thread.userId ? null : thread.author);
      });
    } else {
      focusedThreadIdRef.current = null;
      focusedThreadScrollDoneRef.current = null;
      setFocusedThreadId(null);
      setHighlightedThreadId(null);
    }
    if (params.mode === "compose") setComposerOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentSessionKey, entryReady, openVisibleProfile, search]);

  useEffect(() => {
    if (!entryReady) return;
    let active = true;
    void readNativeSocialStoredState(userId).then((stored) => {
      if (active) {
        setStoredSets({
          saved: new Set(stored.saved),
          pinned: new Set(stored.pinned),
          pinnedAt: new Map(Object.entries(stored.pinnedAt || {})),
          source: "cache",
          status: "hydrating",
        });
      }
    });
    return () => { active = false; };
  }, [entryReady, userId]);

  useEffect(() => {
    if (!entryReady) return;
    if (!userId) {
      setBlockedUsers(new Set());
      setIsGoldUser(false);
      setSocialPostingBlocked(false);
      setFeedScopeCountry(null);
      setViewerScope(null);
      setFeedScopeResolved(true);
      return;
    }
    let active = true;
    let freshViewerScopeApplied = false;
    setFeedScopeResolved(false);
    const requestSessionKey = currentSessionKey;
    const scopeFallbackTimer = setTimeout(() => {
      if (!active || socialSessionKeyRef.current !== requestSessionKey) return;
      setFeedScopeResolved(true);
    }, SOCIAL_SCOPE_FALLBACK_MS);
    const profileSummaryPromise = fetchNativeProfileSummary(userId, { accessToken, sessionKey: requestSessionKey });
    const freshViewerScopePromise = resolveNativeViewerScope({ userId, accessToken, sessionKey: requestSessionKey });
    void readCachedNativeViewerScope(userId, { sessionKey: requestSessionKey })
      .then((scope) => {
        if (!active || !scope || freshViewerScopeApplied || socialSessionKeyRef.current !== requestSessionKey) return;
        setViewerScope(scope);
        setFeedScopeCountry(nativeSocialFeedScopeCacheKey(scope));
        clearTimeout(scopeFallbackTimer);
        setFeedScopeResolved(true);
      })
      .catch(() => undefined);
    void freshViewerScopePromise.then((scope) => {
      if (!active || !scope || socialSessionKeyRef.current !== requestSessionKey) return;
      freshViewerScopeApplied = true;
      setViewerScope(scope);
      setFeedScopeCountry(nativeSocialFeedScopeCacheKey(scope));
    }).catch(() => undefined);
    void loadNativeBlockedSocialUserIds(userId, accessToken)
      .then((ids) => { if (active && socialSessionKeyRef.current === requestSessionKey) setBlockedUsers(ids); })
      .catch(() => undefined);
    void Promise.allSettled([
      profileSummaryPromise,
      freshViewerScopePromise,
    ]).then(([profileResult]) => {
      if (!active || socialSessionKeyRef.current !== requestSessionKey) return;
      const snapshot = profileResult.status === "fulfilled" ? profileResult.value : null;
      const tier = normalizeQuotaTier(snapshot?.profile?.effective_tier || snapshot?.profile?.tier || "free");
        setIsGoldUser(tier === "gold");
    }).finally(() => {
      clearTimeout(scopeFallbackTimer);
      if (active) setFeedScopeResolved(true);
    });
    void isNativeRestrictionActive("social_posting_disabled").then((blocked) => { if (active && socialSessionKeyRef.current === requestSessionKey) setSocialPostingBlocked(blocked); });
    return () => {
      active = false;
      clearTimeout(scopeFallbackTimer);
    };
  }, [accessToken, currentSessionKey, entryReady, syncCommentSupportFromRows, userId]);

  useEffect(() => {
    if (!entryReady || !userId) return undefined;
    return subscribeNativeViewerScope(userId, (scope) => {
      if (socialSessionKeyRef.current !== currentSessionKey) return;
      setViewerScope(scope);
      setFeedScopeCountry(nativeSocialFeedScopeCacheKey(scope));
      setFeedScopeResolved(true);
      setLocationScopeRevision((revision) => revision + 1);
    }, { sessionKey: currentSessionKey });
  }, [currentSessionKey, entryReady, userId]);

  useEffect(() => {
    if (!entryReady) return undefined;
    if (!userId) return undefined;
    return subscribeNativeProfileSummary(userId, ({ profile }) => {
      const verified = isNativeVerifiedProfile(profile);
      const verificationStatus = verified ? "verified" : typeof profile?.verification_status === "string" ? profile.verification_status : null;
      const displayName = String(profile?.display_name || "").trim();
      const socialId = typeof profile?.social_id === "string" ? profile.social_id : null;
      const avatarUrl = typeof profile?.avatar_url === "string" ? profile.avatar_url : null;
      const locationCountry = typeof profile?.location_country === "string" ? profile.location_country : null;
      setThreads((current) => current.map((thread) => thread.userId === userId
        ? {
          ...thread,
          author: {
            ...thread.author,
            displayName: displayName || thread.author.displayName,
            socialId: socialId ?? thread.author.socialId,
            avatarUrl: avatarUrl ?? thread.author.avatarUrl,
            verificationStatus,
            locationCountry: locationCountry ?? thread.author.locationCountry,
            isVerified: verified,
          },
        }
        : thread));
      setCommentsByThread((current) => {
        const next: typeof current = {};
        let changed = false;
        Object.entries(current).forEach(([threadId, comments]) => {
          const nextComments = comments.map((comment) => {
            if (comment.userId !== userId) return comment;
            changed = true;
            return {
              ...comment,
              author: {
                ...comment.author,
                displayName: displayName || comment.author.displayName,
                socialId: socialId ?? comment.author.socialId,
                avatarUrl: avatarUrl ?? comment.author.avatarUrl,
                verificationStatus,
                locationCountry: locationCountry ?? comment.author.locationCountry,
                isVerified: verified,
              },
            };
          });
          next[threadId] = nextComments;
        });
        return changed ? next : current;
      });
    }, { sessionKey });
  }, [entryReady, sessionKey, userId]);

  useEffect(() => () => {
    dwellTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    dwellTimeoutsRef.current.clear();
    if (composeFabRevealTimeoutRef.current) clearTimeout(composeFabRevealTimeoutRef.current);
    composeFabRevealTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    Animated.timing(composeFabOpacityRef.current, {
      duration: huddleMotion.durations.base,
      toValue: hideComposeFab ? 0 : 1,
      useNativeDriver: true,
    }).start();
  }, [hideComposeFab]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? "" : current)), NATIVE_TOAST_DURATION_MS);
  }, []);

  const markThreadMutated = useCallback((threadId: string) => {
    if (!threadId) return;
    mutatedThreadIdsRef.current.add(threadId);
    removedThreadIdsRef.current.delete(threadId);
  }, []);

  const markThreadRemoved = useCallback((threadId: string) => {
    if (!threadId) return;
    removedThreadIdsRef.current.add(threadId);
    mutatedThreadIdsRef.current.delete(threadId);
    mutatedCommentIdsByThreadRef.current.delete(threadId);
    removedCommentIdsByThreadRef.current.delete(threadId);
  }, []);

  const markCommentMutated = useCallback((threadId: string, commentId: string) => {
    if (!threadId || !commentId) return;
    const mutated = mutatedCommentIdsByThreadRef.current.get(threadId) ?? new Set<string>();
    mutated.add(commentId);
    mutatedCommentIdsByThreadRef.current.set(threadId, mutated);
    removedCommentIdsByThreadRef.current.get(threadId)?.delete(commentId);
  }, []);

  const markCommentRemoved = useCallback((threadId: string, commentId: string) => {
    if (!threadId || !commentId) return;
    const removed = removedCommentIdsByThreadRef.current.get(threadId) ?? new Set<string>();
    removed.add(commentId);
    removedCommentIdsByThreadRef.current.set(threadId, removed);
    mutatedCommentIdsByThreadRef.current.get(threadId)?.delete(commentId);
  }, []);

  const applyThreadMutationTruth = useCallback((incoming: NativeSocialThread[], current: NativeSocialThread[]) => {
    const currentById = new Map(current.map((thread) => [thread.id, thread]));
    const seen = new Set<string>();
    const next = incoming
      .filter((thread) => !removedThreadIdsRef.current.has(thread.id))
      .map((thread) => {
        seen.add(thread.id);
        // Keep locally-mutated state (like/comment counts, edits) for mutated
        // threads, but always take the server-authoritative author identity
        // (avatar, name, verification) from the fresh row — otherwise a stale
        // cached author keeps the avatar one upload behind the latest.
        const local = currentById.get(thread.id);
        return mutatedThreadIdsRef.current.has(thread.id) && local
          ? { ...local, author: thread.author }
          : thread;
      });
    current.forEach((thread) => {
      if (mutatedThreadIdsRef.current.has(thread.id) && !removedThreadIdsRef.current.has(thread.id) && !seen.has(thread.id)) {
        next.unshift(thread);
      }
    });
    const focusedId = focusedThreadIdRef.current;
    const focusedThread = focusedId ? currentById.get(focusedId) : null;
    if (focusedThread && !removedThreadIdsRef.current.has(focusedThread.id) && !seen.has(focusedThread.id)) {
      next.unshift(focusedThread);
    }
    return next;
  }, []);

  const applyCommentMutationTruth = useCallback((threadId: string, incoming: NativeSocialComment[], current: NativeSocialComment[]) => {
    const removed = removedCommentIdsByThreadRef.current.get(threadId);
    const mutated = mutatedCommentIdsByThreadRef.current.get(threadId);
    if (!removed?.size && !mutated?.size) return incoming;
    const currentById = new Map(current.map((comment) => [comment.id, comment]));
    const seen = new Set<string>();
    const next = incoming
      .filter((comment) => !removed?.has(comment.id))
      .map((comment) => {
        seen.add(comment.id);
        // Preserve local mutation state but refresh the author identity from the
        // fresh row so avatars never lag one upload behind (see thread truth above).
        const local = currentById.get(comment.id);
        return mutated?.has(comment.id) && local
          ? { ...local, author: comment.author }
          : comment;
      });
    current.forEach((comment) => {
      if (!mutated?.has(comment.id) || removed?.has(comment.id) || seen.has(comment.id)) return;
      seen.add(comment.id);
      next.push(comment);
    });
    return dedupeNativeSocialComments(next);
  }, []);

  const recordFeedEvent = useCallback((threadId: string, eventType: "impression" | "dwell_10s" | "profile_view" | "expand_post" | "save" | "comment" | "like" | "share" | "hide" | "block" | "open_comments") => {
    void recordNativeSocialFeedEvent({ accessToken, eventType, sessionId: feedSessionIdRef.current, threadId, userId });
  }, [accessToken, userId]);

  const writeStoredSetsMirror = useCallback((next: StoredSets) => {
    void writeNativeSocialStoredState(userId, {
      saved: Array.from(next.saved),
      pinned: Array.from(next.pinned),
      pinnedAt: Object.fromEntries(next.pinnedAt),
    });
  }, [userId]);

  const applyDbPreferences = useCallback((preferences: Awaited<ReturnType<typeof fetchNativeSocialPostPreferences>>, mode: "merge" | "replaceVisible", visibleIds?: string[]) => {
    setStoredSets((current) => {
      const nextSaved = new Set(current.saved);
      const nextPinned = new Set(current.pinned);
      const nextPinnedAt = new Map(current.pinnedAt);
      const ids = new Set(visibleIds || preferences.map((preference) => preference.threadId));
      if (mode === "replaceVisible") {
        ids.forEach((id) => {
          nextSaved.delete(id);
          nextPinned.delete(id);
          nextPinnedAt.delete(id);
        });
      }
      preferences.forEach((preference) => {
        if (preference.isSaved) nextSaved.add(preference.threadId);
        else nextSaved.delete(preference.threadId);
        if (preference.isPinned) nextPinned.add(preference.threadId);
        else nextPinned.delete(preference.threadId);
        if (preference.pinnedAt) nextPinnedAt.set(preference.threadId, preference.pinnedAt);
        else nextPinnedAt.delete(preference.threadId);
      });
      const next = { saved: nextSaved, pinned: nextPinned, pinnedAt: nextPinnedAt, source: "db" as const, status: "fresh" as const };
      writeStoredSetsMirror(next);
      return next;
    });
  }, [writeStoredSetsMirror]);

  const load = useCallback(async (mode: "reset" | "more" | "coverage" | "refresh" | "revalidate" = "reset") => {
    if (!userId) {
      setThreads([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setHasMore(false);
      setCursor(null);
      return;
    }
    if (!feedScopeResolved) return;
    if ((mode === "more" || mode === "coverage") && (!hasMoreRef.current || loadingMoreRef.current)) return;
    if ((mode === "more" || mode === "coverage" || mode === "revalidate") && feedLoadGateRef.current.inFlight) return;
    if (mode === "refresh") {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_DEBOUNCE_MS) return;
      lastRefreshAtRef.current = now;
    }
    const requestSessionKey = currentSessionKey;
    const cacheWriteGuard = () => socialSessionKeyRef.current === requestSessionKey;
    const currentSortMode = sortModeRef.current;
    const feedViewerScope = viewerScope;
    const scopePoint = feedViewerScope?.primaryPoint ?? null;
    const scopeKey = JSON.stringify({
      adminArea: feedViewerScope?.adminArea ?? null,
      city: feedViewerScope?.city ?? null,
      country: feedViewerScope?.country ?? null,
      countryCode: feedViewerScope?.countryCode ?? null,
      district: feedViewerScope?.district ?? null,
      lat: typeof scopePoint?.lat === "number" ? Number(scopePoint.lat.toFixed(4)) : null,
      lng: typeof scopePoint?.lng === "number" ? Number(scopePoint.lng.toFixed(4)) : null,
      profileCountry: feedViewerScope?.profileCountry ?? null,
      profileCountryName: feedViewerScope?.profileCountryName ?? null,
      profileDistrict: feedViewerScope?.profileDistrict ?? null,
      profileLocationName: feedViewerScope?.profileLocationName ?? null,
      source: feedViewerScope?.source ?? null,
    });
    const feedCacheKey = nativeSocialFeedCacheKey(userId, requestSessionKey, feedScopeCountry, currentSortMode);
    const loadGateKey = JSON.stringify({
      country: feedScopeCountry || "global",
      cursor: mode === "more" || mode === "coverage" ? cursorRef.current : null,
      mode,
      session: requestSessionKey,
      scope: scopeKey,
      sortMode: currentSortMode,
      userId,
    });

    if (mode === "reset") {
      const cachedFeed = await readNativeSocialPersistentCache<{
        rows: NativeSocialThread[];
        cursor: string | null;
        hasMore: boolean;
      }>(feedCacheKey, SOCIAL_FEED_CACHE_MAX_AGE_MS);

      if (!cacheWriteGuard()) return;
      if (cachedFeed) {
        setThreads((current) => applyThreadMutationTruth(cachedFeed.rows, current));
        setCursor(cachedFeed.cursor as NativeSocialFeedCursor | null);
        setHasMore(cachedFeed.hasMore);
        setLoading(false);
        const recentlyConfirmed = await readNativeSocialPersistentCache<{
          rows: NativeSocialThread[];
          cursor: string | null;
          hasMore: boolean;
        }>(feedCacheKey, SOCIAL_FEED_ENTRY_REUSE_MS);
        if (recentlyConfirmed) return;
      } else {
        setLoading(true);
      }
    }
    const now = Date.now();
    const gate = feedLoadGateRef.current;
    if (gate.key === loadGateKey && (gate.inFlight || now - gate.lastStartedAt < 1200)) {
      if (mode === "refresh") setRefreshing(false);
      if (mode === "more") setLoadingMore(false);
      return;
    }
    feedLoadGateRef.current = { key: loadGateKey, inFlight: true, lastStartedAt: now };
    // Bump the request id only after passing the dedupe gate, so a deduped re-fire
    // can't invalidate the in-flight load's completion handler and orphan `loading`.
    const requestId = ++requestIdRef.current;
    if (mode === "refresh") {
      topicCoverageAttemptRef.current.clear();
      setRefreshing(true);
    }
    if (mode === "revalidate") setRevalidating(true);
    if (mode === "more") setLoadingMore(true);
    setError("");
    try {
      const page = await fetchNativeSocialFeedPage({
        accessToken,
        viewerId: userId,
        sortMode: currentSortMode,
        cursor: mode === "more" || mode === "coverage" ? cursorRef.current : null,
        limit: mode === "more" || mode === "coverage" ? SOCIAL_MORE_FEED_LIMIT : SOCIAL_INITIAL_FEED_LIMIT,
        viewerScope: feedViewerScope,
      });
      if (requestIdRef.current !== requestId || !cacheWriteGuard()) return;
      setThreads((current) => {
        const freshIds = new Set(page.rows.map((row) => row.id));
        const shouldMerge = mode === "more" || mode === "coverage" || mode === "refresh" || mode === "revalidate";
        const incoming = shouldMerge
          ? [...page.rows, ...current.filter((thread) => !freshIds.has(thread.id))]
          : page.rows;
        const nextRows = applyThreadMutationTruth(incoming, current);
        if (mode !== "reset" && cacheWriteGuard()) {
          const cachedRows = nextRows.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT);
          void writeNativeSocialPersistentCache(feedCacheKey, {
            rows: cachedRows,
            cursor: buildNativeSocialCursor(cachedRows[cachedRows.length - 1]),
            hasMore: page.hasMore || nextRows.length > cachedRows.length,
          });
        }
        return nextRows;
      });
      if (mode === "more" || mode === "coverage") {
        // Always advance terminal pagination truth, even if every row dedupes.
        // Otherwise end-reached repeats the same cursor and loader forever.
        cursorRef.current = page.cursor;
        hasMoreRef.current = page.hasMore;
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      } else if (mode === "reset") {
        cursorRef.current = page.cursor;
        hasMoreRef.current = page.hasMore;
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      }
      if (mode === "reset" && cacheWriteGuard()) {
        const snapshot = {
          rows: page.rows.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
          cursor: page.cursor,
          hasMore: page.hasMore,
        };
        void writeNativeSocialPersistentCache(feedCacheKey, snapshot);
        // Keep the scope-independent boot snapshot fresh too, so every revisit (the
        // screen remounts on each tab switch) paints instantly from the latest feed.
        if (currentSortMode === "Latest") {
          void writeNativeSocialPersistentCache(nativeSocialBootFeedCacheKey(userId, requestSessionKey), snapshot);
        }
      }
    } catch {
      if (requestIdRef.current === requestId && mode === "reset") setError("Unable to load Social right now.");
    } finally {
      if (feedLoadGateRef.current.key === loadGateKey) feedLoadGateRef.current.inFlight = false;
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
        setRevalidating(false);
        setLoadingMore(false);
      }
    }
  }, [accessToken, applyThreadMutationTruth, currentSessionKey, feedScopeCountry, feedScopeResolved, userId, viewerScope]);

  const handledLocationScopeRevisionRef = useRef(0);
  useEffect(() => {
    if (!entryReady || !feedScopeResolved || locationScopeRevision === 0) return;
    if (handledLocationScopeRevisionRef.current === locationScopeRevision) return;
    handledLocationScopeRevisionRef.current = locationScopeRevision;
    // Revalidate with the newly committed scope. A country-only cache key is
    // intentionally retained for instant paint, but must never suppress an
    // in-country district/coordinate change.
    void load("revalidate");
  }, [entryReady, feedScopeResolved, load, locationScopeRevision]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      Keyboard.dismiss();
      setComposerOpen(false);
      setMoreThread(null);
      setMoreThreadAnchor(null);
      setReportThread(null);
      setShareThread(null);
      setProfileUserId(null);
      setEditingThread(null);
      setEditingComment(null);
      setCommentReportTarget(null);
      setMoreCommentTarget(null);
      setMoreCommentAnchor(null);
      setDeleteThreadTarget(null);
      setBlockThreadTarget(null);
      setBlockCommentTarget(null);
      setSocialRestrictionModalOpen(false);
      return;
    }
    // The mounted feed is already the last committed state. Realtime signals,
    // explicit refresh, mutations, scope/filter changes and the new-posts CTA
    // own reconciliation; ordinary navigation must remain network-free.
    if (!becameActive) return;
  }, [active]);

  // Instant cache-first paint. The scoped `load` is gated behind feedScopeResolved,
  // which can wait up to SOCIAL_SCOPE_FALLBACK_MS on a cold scope cache — wasting the
  // boot/brand-window warm on first open. This effect reads the cached viewer scope
  // (written by the boot warm) and paints the warmed feed immediately, the same
  // cache-first behaviour Discover and Map already have. It never clobbers live data:
  // it only paints when the feed is still empty and the session still matches, and the
  // scoped `load` reconciles/refreshes right after.
  useEffect(() => {
    if (!entryReady || !userId) return undefined;
    let active = true;
    const requestSessionKey = currentSessionKey;
    const paint = (cached: { rows: NativeSocialThread[]; cursor: string | null; hasMore: boolean } | null | undefined) => {
      if (!active || !cached || socialSessionKeyRef.current !== requestSessionKey) return false;
      setThreads((current) => (current.length ? current : applyThreadMutationTruth(cached.rows, current)));
      setCursor((current) => (current ? current : (cached.cursor as NativeSocialFeedCursor | null)));
      setHasMore(cached.hasMore);
      setLoading(false);
      return true;
    };
    void (async () => {
      // 1. Scope-independent boot snapshot — paints instantly, no scope wait.
      const boot = await readNativeSocialPersistentCache<{
        rows: NativeSocialThread[];
        cursor: string | null;
        hasMore: boolean;
      }>(nativeSocialBootFeedCacheKey(userId, requestSessionKey), SOCIAL_FEED_CACHE_MAX_AGE_MS).catch(() => null);
      paint(boot);
      // 2. Scoped snapshot if the cached scope is already available (more precise).
      const scope = await readCachedNativeViewerScope(userId, { sessionKey: requestSessionKey }).catch(() => null);
      if (!active || !scope || socialSessionKeyRef.current !== requestSessionKey) return;
      const scoped = await readNativeSocialPersistentCache<{
        rows: NativeSocialThread[];
        cursor: string | null;
        hasMore: boolean;
      }>(nativeSocialFeedCacheKey(userId, requestSessionKey, nativeSocialFeedScopeCacheKey(scope), "Latest"), SOCIAL_FEED_CACHE_MAX_AGE_MS).catch(() => null);
      paint(scoped);
    })();
    return () => { active = false; };
  }, [applyThreadMutationTruth, currentSessionKey, entryReady, userId]);

  useEffect(() => {
    if (!entryReady || !feedScopeResolved) return;
    // Fire the initial load on the next frame rather than via
    // InteractionManager.runAfterInteractions. Outstanding interaction handles
    // from boot/onboarding Animated loops (isInteraction defaults to true) could
    // defer — sometimes indefinitely — the first load AND its cache read, so the
    // skeleton stayed stuck until a later navigation drained the queue.
    const frame = requestAnimationFrame(() => {
      void load("reset");
    });
    return () => cancelAnimationFrame(frame);
  }, [entryReady, feedScopeResolved, load, sortMode]);

  const visibleThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = threads.filter((thread) => !thread.author.nonSocial && !blockedUsers.has(thread.userId) && !hiddenThreadIds.has(thread.id));
    const tagFiltered = selectedTags.length === 0 ? base : base.filter((thread) =>
      selectedTags.some((tag) => (SOCIAL_TAG_ALIASES[tag] ?? [tag]).some((candidate) => thread.tags.includes(candidate)))
    );
    const savedFiltered = sortMode === "Saves" ? tagFiltered.filter((thread) => storedSets.status === "fresh" && storedSets.saved.has(thread.id)) : tagFiltered;
    const searched = savedFiltered.filter((thread) => {
      if (!normalizedQuery) return true;
      const comments = commentsByThread[thread.id] || [];
      return [
        thread.title,
        thread.content,
        thread.author.displayName || "",
        thread.tags.join(" "),
        thread.hashtags.join(" "),
        ...comments.map((comment) => comment.content || ""),
        ...comments.map((comment) => comment.author.displayName || ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
    const focusedThread = focusedThreadId ? base.find((thread) => thread.id === focusedThreadId) : null;
    const displayRows = focusedThread && !searched.some((thread) => thread.id === focusedThread.id)
      ? [focusedThread, ...searched]
      : searched;
    return [...displayRows].sort((a, b) => {
      const aPinned = storedSets.status === "fresh" && storedSets.pinned.has(a.id);
      const bPinned = storedSets.status === "fresh" && storedSets.pinned.has(b.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) {
        const pinnedDiff = new Date(storedSets.pinnedAt.get(b.id) || 0).getTime() - new Date(storedSets.pinnedAt.get(a.id) || 0).getTime();
        if (pinnedDiff) return pinnedDiff;
      }
      if (sortMode === "Trending" && b.score !== a.score) return b.score - a.score;
      const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return createdDiff || b.id.localeCompare(a.id);
    });
  }, [blockedUsers, commentsByThread, focusedThreadId, hiddenThreadIds, query, selectedTags, sortMode, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, storedSets.status, threads]);

  useEffect(() => {
    topicCoverageAttemptRef.current.clear();
  }, [currentSessionKey, feedScopeCountry, sortMode]);

  // Topic tabs are views over the shared feed, so they paint from memory with no
  // loading state. If the loaded All page has no row for a selected topic, make one
  // bounded background pagination attempt. Never let an empty FlatList repeatedly
  // walk the entire feed or churn a loader when the server is exhausted.
  useEffect(() => {
    const selectedTopic = selectedTags[0];
    if (!selectedTopic || query.trim() || loading || loadingMore || revalidating || !hasMore || visibleThreads.length > 0) return;
    const attemptKey = `${currentSessionKey}:${feedScopeCountry || "global"}:${sortMode}:${selectedTopic}`;
    if (topicCoverageAttemptRef.current.has(attemptKey)) return;
    topicCoverageAttemptRef.current.add(attemptKey);
    void load("coverage");
  }, [currentSessionKey, feedScopeCountry, hasMore, load, loading, loadingMore, query, revalidating, selectedTags, sortMode, visibleThreads.length]);

  const loadedThreadIdsKey = useMemo(() => threads.map((thread) => thread.id).filter(Boolean).sort().join(","), [threads]);
  const visibleThreadIdsKey = useMemo(() => visibleThreads.map((thread) => thread.id).join(","), [visibleThreads]);

  useEffect(() => {
    if (!focusedThreadId || focusedThreadScrollDoneRef.current === focusedThreadId) return;
    const index = visibleThreads.findIndex((thread) => thread.id === focusedThreadId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      focusedThreadScrollDoneRef.current = focusedThreadId;
      listRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.5 });
      setHighlightedThreadId(focusedThreadId);
      if (focusedThreadHighlightTimerRef.current) clearTimeout(focusedThreadHighlightTimerRef.current);
      focusedThreadHighlightTimerRef.current = setTimeout(() => {
        setHighlightedThreadId((current) => current === focusedThreadId ? null : current);
        focusedThreadHighlightTimerRef.current = null;
      }, 2600);
    }, 120);
    return () => clearTimeout(timer);
  }, [focusedThreadId, visibleThreads, visibleThreadIdsKey]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedVisibleThreadIdsKey(visibleThreadIdsKey), SOCIAL_EFFECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visibleThreadIdsKey]);


  useEffect(() => {
    if (!userId || !accessToken || !loadedThreadIdsKey) return undefined;
    let active = true;
    const requestSessionKey = currentSessionKey;
    const ids = loadedThreadIdsKey.split(",").filter(Boolean);
    void (async () => {
      let preferences: Awaited<ReturnType<typeof fetchNativeSocialPostPreferences>>;
      try {
        preferences = await fetchNativeSocialPostPreferences(ids, accessToken);
      } catch {
        // Preference hydration is secondary to the feed mutation. Retry once
        // so a transient request failure self-heals without interrupting the
        // user's successful post or surfacing an unrelated banner.
        try {
          preferences = await fetchNativeSocialPostPreferences(ids, accessToken);
        } catch {
          return;
        }
      }
      if (!active || socialSessionKeyRef.current !== requestSessionKey) return;
      applyDbPreferences(preferences, "replaceVisible", ids);
    })();
    return () => { active = false; };
  }, [accessToken, applyDbPreferences, currentSessionKey, loadedThreadIdsKey, userId]);

  const openPostingRestriction = useCallback(() => {
    setSocialRestrictionModalOpen(true);
  }, []);

  const queueCommentSnap = useCallback((threadId: string, target: "panel" | "composer", anchorCommentId?: string | null, offset?: number) => {
    if (!threadId) return;
    if (pendingSnapTimeoutRef.current) clearTimeout(pendingSnapTimeoutRef.current);
    pendingSnapRef.current = {
      threadId,
      target,
      anchorCommentId,
      offset,
    };
    pendingSnapTimeoutRef.current = setTimeout(() => {
      pendingSnapRef.current = null;
      pendingSnapTimeoutRef.current = null;
    }, COMMENT_SNAP_INTENT_TTL_MS);
  }, []);

  const firePendingCommentSnap = useCallback((threadId: string, target: "panel" | "composer", ref: RefObject<View | null>) => {
    const pending = pendingSnapRef.current;
    if (!pending || pending.threadId !== threadId || pending.target !== target) return;
    const node = ref.current;
    const viewport = listViewportRef.current;
    if (!node || !viewport) return;
    viewport.measureInWindow((_viewportX, viewportY) => {
      node.measureInWindow((_nodeX, nodeY, _width, height) => {
        const y = lastScrollOffsetRef.current + nodeY - viewportY;
        const visibleHeight = Math.max(0, listHeightRef.current - keyboardHeightRef.current);
        const centeredOffset = typeof pending.offset === "number"
          ? y - pending.offset
          : y - Math.max(0, (visibleHeight - height) / 2);
        listRef.current?.scrollToOffset({
          offset: Math.max(0, centeredOffset),
          animated: true,
        });
        pendingSnapRef.current = null;
        if (pendingSnapTimeoutRef.current) {
          clearTimeout(pendingSnapTimeoutRef.current);
          pendingSnapTimeoutRef.current = null;
        }
      });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardHeightRef.current = event.endCoordinates.height;
      const threadId = activeComposerThreadIdRef.current;
      const ref = threadId ? replyComposerNodeRefs.current.get(`${threadId}:composer`) : null;
      if (threadId && ref?.current) {
        pendingSnapRef.current = { threadId, target: "composer", anchorCommentId: replyComposerAnchorCommentId };
        firePendingCommentSnap(threadId, "composer", ref);
      }
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [firePendingCommentSnap, replyComposerAnchorCommentId]);

  const resetLayoutRefs = useCallback(() => {
    const validThreads = new Set(visibleThreads.map((thread) => thread.id));
    threadNodeRefs.current.forEach((_, threadId) => {
      if (!validThreads.has(threadId)) threadNodeRefs.current.delete(threadId);
    });
    commentPanelNodeRefs.current.forEach((_, threadId) => {
      if (!validThreads.has(threadId)) commentPanelNodeRefs.current.delete(threadId);
    });
    replyComposerNodeRefs.current.forEach((_, key) => {
      const threadId = key.replace(/:composer$/, "");
      if (!validThreads.has(threadId)) replyComposerNodeRefs.current.delete(key);
    });
  }, [visibleThreads]);

  useEffect(() => {
    resetLayoutRefs();
  }, [visibleThreads, resetLayoutRefs]);

  useEffect(() => {
    if (!userId) {
      setSupportedThreadIds(new Set());
      return;
    }
    const ids = debouncedVisibleThreadIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) {
      setSupportedThreadIds(new Set());
      return;
    }
    let active = true;
    const requestSessionKey = currentSessionKey;
    void loadNativeSupportedSocialThreadIds(userId, ids, accessToken)
      .then((next) => { if (active && socialSessionKeyRef.current === requestSessionKey) setSupportedThreadIds(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken, currentSessionKey, debouncedVisibleThreadIdsKey, feedScopeCountry, userId]);

  /**
   * Queue a counter reconciliation for one thread.
   *
   * Every caller — realtime support events, realtime comment events and scroll-in —
   * funnels through here. Ids accumulate in a set and flush together on a single
   * timer, so N threads changing at once is one round trip, not N. Only the two
   * counters are patched; author, media and body are left untouched, which is what
   * keeps this off the expensive fetchNativeSocialThreadById path.
   */
  const queueThreadCountRefresh = useCallback((threadIds: string | string[]) => {
    if (!userId) return;
    const incoming = Array.isArray(threadIds) ? threadIds : [threadIds];
    incoming.forEach((threadId) => {
      if (threadId) pendingCountThreadIdsRef.current.add(threadId);
    });
    if (pendingCountThreadIdsRef.current.size === 0) return;
    if (countRefreshTimerRef.current) return;

    countRefreshTimerRef.current = setTimeout(() => {
      countRefreshTimerRef.current = null;
      if (countRefreshInFlightRef.current) {
        // Something is already in flight; re-arm so these ids ride the next flush
        // instead of opening a second concurrent request.
        if (pendingCountThreadIdsRef.current.size > 0) queueThreadCountRefresh([]);
        return;
      }
      const ids = Array.from(pendingCountThreadIdsRef.current);
      pendingCountThreadIdsRef.current.clear();
      if (ids.length === 0) return;

      countRefreshInFlightRef.current = true;
      const requestSessionKey = currentSessionKey;
      void fetchNativeSocialThreadCounts(ids, accessToken)
        .then((rows) => {
          if (!rows.length || socialSessionKeyRef.current !== requestSessionKey) return;
          const byId = new Map(rows.map((row) => [row.threadId, row]));
          const now = Date.now();
          ids.forEach((threadId) => realtimeThreadRefreshLastAtRef.current.set(threadId, now));
          setThreads((current) => {
            let changed = false;
            const nextThreads = current.map((thread) => {
              const counts = byId.get(thread.id);
              if (!counts) return thread;
              if (thread.likes === counts.supportCount && thread.commentCount === counts.commentCount) return thread;
              changed = true;
              return { ...thread, likes: counts.supportCount, commentCount: counts.commentCount };
            });
            return changed ? nextThreads : current;
          });
        })
        .catch(() => undefined)
        .finally(() => {
          countRefreshInFlightRef.current = false;
          if (pendingCountThreadIdsRef.current.size > 0) queueThreadCountRefresh([]);
        });
    }, SOCIAL_REALTIME_REFRESH_COOLDOWN_MS);
  }, [accessToken, currentSessionKey, userId]);

  const scheduleRealtimeThreadRefresh = useCallback((threadId: string) => {
    if (!userId || !threadId) return;
    if (realtimeThreadRefreshTimersRef.current.has(threadId)) return;
    const run = () => {
      realtimeThreadRefreshTimersRef.current.delete(threadId);
      if (realtimeThreadRefreshInFlightRef.current.has(threadId)) return;
      realtimeThreadRefreshInFlightRef.current.add(threadId);
      const requestSessionKey = currentSessionKey;
      const cacheWriteGuard = () => socialSessionKeyRef.current === requestSessionKey;
      void fetchNativeSocialThreadById(threadId, accessToken).then((freshThread) => {
        if (!cacheWriteGuard()) return;
        realtimeThreadRefreshLastAtRef.current.set(threadId, Date.now());
        if (!freshThread) {
          return;
        }
        setThreads((current) => {
          const nextThreads = applyThreadMutationTruth(current.map((thread) => (
            thread.id === threadId
              ? { ...thread, ...freshThread }
              : thread
          )), current);
          if (cacheWriteGuard() && nextThreads.length > 0) {
            void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, requestSessionKey, feedScopeCountry, sortModeRef.current), {
              rows: nextThreads.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
              cursor: cursorRef.current,
              hasMore: hasMoreRef.current,
            });
          }
          return nextThreads;
        });
      }).catch(() => undefined).finally(() => {
        realtimeThreadRefreshInFlightRef.current.delete(threadId);
      });
    };
    const elapsed = Date.now() - (realtimeThreadRefreshLastAtRef.current.get(threadId) || 0);
    const delay = Math.max(0, SOCIAL_REALTIME_REFRESH_COOLDOWN_MS - elapsed);
    realtimeThreadRefreshTimersRef.current.set(threadId, setTimeout(run, delay));
  }, [accessToken, applyThreadMutationTruth, currentSessionKey, feedScopeCountry, userId]);

  /**
   * New-post discovery.
   *
   * Every other Social channel filters on `id=eq.<threadId>` for threads already
   * loaded, so a brand-new row — including a Map alert cross-posted via
   * create_alert_thread_and_pin — has an id no filter matches and reaches nobody.
   *
   * This deliberately does NOT open an unfiltered postgres_changes listener (see
   * realtimeScopeRegressionContract). It rides the same private invalidation bus the
   * Map already uses: a trigger on threads calls private.send_huddle_invalidation on
   * a country-scoped topic, so the server fans out one tiny "social.changed" ping
   * instead of evaluating every INSERT against every subscriber's RLS.
   *
   * The ping carries no row data, so we reconcile with the cheap batched counts path
   * only when the reader asks for it: others' posts just light up a pill.
   */
  useEffect(() => {
    if (!userId || !entryReady) return undefined;
    const topic = nativeSocialRealtimeTopic();

    const handle = createSinglePrivateBroadcastChannel(
      `native-social-new-threads:${userId}:${topic}`,
      topic,
      () => {
        // Parity with Threads/X: if the reader is already at the top, fold new posts
        // in silently. If they have scrolled into older content, never move the list
        // under them — offer the pill and let them choose.
        if (lastScrollOffsetRef.current <= NEW_POSTS_AUTO_MERGE_OFFSET) {
          void load("revalidate");
          return;
        }
        setHasNewPosts(true);
      },
    );

    return () => {
      void handle.dispose();
    };
  }, [entryReady, load, userId]);

  const showNewPosts = useCallback(() => {
    setHasNewPosts(false);
    releaseFocusedThread();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    haptic.primaryConfirm();
    void load("reset");
  }, [load, releaseFocusedThread]);

  // Scroll-in reconciliation.
  //
  // A postgres_changes subscription only delivers events that happen *after* it is
  // established, and subscriptions are scoped to the viewport. Without this, a like
  // or comment that landed while a post was off-screen would still show the stale
  // count when you scrolled back to it. One batched query per scroll settle closes
  // that gap, which is what makes the counts trustworthy rather than merely live.
  useEffect(() => {
    if (!userId || !debouncedVisibleThreadIdsKey) return undefined;
    const ids = debouncedVisibleThreadIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return undefined;
    // Skip threads whose counters a realtime flush already refreshed this second.
    const now = Date.now();
    const stale = ids.filter((threadId) => (
      now - (realtimeThreadRefreshLastAtRef.current.get(threadId) || 0) >= SOCIAL_REALTIME_REFRESH_COOLDOWN_MS
    ));
    if (stale.length === 0) return undefined;
    queueThreadCountRefresh(stale);
    return undefined;
  }, [debouncedVisibleThreadIdsKey, queueThreadCountRefresh, userId]);

  useEffect(() => {
    if (!userId || !debouncedVisibleThreadIdsKey) return undefined;

    const ids = debouncedVisibleThreadIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return undefined;

    const idSet = new Set(ids);
    const handle = createSingleRealtimeChannel(`native-social-thread-supports:${ids.slice().sort().join(",")}`, (channel) => {
      ids.forEach((threadId) => {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "thread_supports", filter: `thread_id=eq.${threadId}` },
          (payload) => {
            const nextRow = (payload.new || {}) as { thread_id?: string; user_id?: string };
            const oldRow = (payload.old || {}) as { thread_id?: string; user_id?: string };
            const changedThreadId = String(nextRow.thread_id || oldRow.thread_id || "");
            if (!idSet.has(changedThreadId)) return;

            const changedUserId = String(nextRow.user_id || oldRow.user_id || "");
            if (changedUserId === userId) {
              const supported = payload.eventType !== "DELETE";
              setSupportedThreadIds((current) => {
                const next = new Set(current);
                if (supported) next.add(changedThreadId);
                else next.delete(changedThreadId);
                return next;
              });
              void updateNativeSupportedSocialThreadCache(userId, changedThreadId, supported);
            }

            // A support only ever moves a counter — reconcile the number, do not
            // refetch and re-hydrate the whole thread.
            queueThreadCountRefresh(changedThreadId);
          },
        );
      });
      return channel;
    });

    return () => {
      void handle.dispose();
    };
  }, [debouncedVisibleThreadIdsKey, queueThreadCountRefresh, userId]);

  useEffect(() => {
    if (!userId || !debouncedVisibleThreadIdsKey) return undefined;
    const ids = debouncedVisibleThreadIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return undefined;
    const subscriptionSessionKey = currentSessionKey;

    const handle = createSingleRealtimeChannel(`native-social-threads:${ids.slice().sort().join(",")}`, (channel) => {
      ids.forEach((threadId) => {
        // Reply counts must move for every thread on screen, not only the ones whose
        // replies are expanded. The expanded-thread channel below refetches the full
        // comment list; this one only refreshes the thread row, which carries the
        // count. Both go through the same 1s cooldown + in-flight guard.
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "thread_comments", filter: `thread_id=eq.${threadId}` },
          () => {
            queueThreadCountRefresh(threadId);
          },
        );
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "threads", filter: `id=eq.${threadId}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setThreads((current) => {
                const nextThreads = current.filter((thread) => thread.id !== threadId);
                if (socialSessionKeyRef.current === subscriptionSessionKey) {
                  void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, subscriptionSessionKey, feedScopeCountry, sortModeRef.current), {
                    rows: nextThreads.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
                    cursor: cursorRef.current,
                    hasMore: hasMoreRef.current,
                  });
                }
                void purgeNativeSocialPersistentCache(userId, { commentsOnlyForThreadId: threadId });
                return nextThreads;
              });
              return;
            }
            scheduleRealtimeThreadRefresh(threadId);
          },
        );
      });
      return channel;
    });

    return () => {
      void handle.dispose();
    };
  }, [currentSessionKey, debouncedVisibleThreadIdsKey, feedScopeCountry, queueThreadCountRefresh, scheduleRealtimeThreadRefresh, userId]);

  const visiblePreviewUrlsKey = useMemo(() => (
    Array.from(new Set([
      ...visibleThreads.map((thread) => extractNativeSocialFirstHttpUrl(thread.content)),
      ...Object.values(commentsByThread).flat().map((comment) => extractNativeSocialFirstHttpUrl(comment.content)),
      extractCompletedComposerPreviewUrl(replyDraft),
    ].filter((url): url is string => isPreviewableExternalUrl(url)))).join("\n")
  ), [commentsByThread, replyDraft, visibleThreads]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPreviewUrlsKey(visiblePreviewUrlsKey), LINK_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visiblePreviewUrlsKey]);

  useEffect(() => {
    const urls = debouncedPreviewUrlsKey.split("\n").filter(Boolean);
    if (urls.length === 0) return;
    let active = true;
    const requestSessionKey = currentSessionKey;
    let urlsToFetch: string[] = [];
    setLinkPreviewByUrl((current) => {
      const next = { ...current };
      urls.forEach((url) => {
        if (!next[url]) {
          urlsToFetch.push(url);
          next[url] = { url, loading: true, failed: false, resolved: false };
        }
      });
      return next;
    });
    urlsToFetch = Array.from(new Set(urlsToFetch));
    if (urlsToFetch.length === 0) return () => { active = false; };
    void fetchNativeSocialLinkPreviews(urlsToFetch, accessToken).then((previews) => {
      if (active && socialSessionKeyRef.current === requestSessionKey) setLinkPreviewByUrl((current) => ({ ...current, ...previews }));
    });
    return () => { active = false; };
  }, [accessToken, currentSessionKey, debouncedPreviewUrlsKey]);

  const refreshAroundMutation = useCallback(() => { void load("reset"); }, [load]);

  const closeComposer = useCallback(() => {
    Keyboard.dismiss();
    setComposerOpen(false);
    setEditingThread(null);
  }, []);

  const submitComposer = useCallback(async (payload: { category: string; content: string; isSensitive: boolean; media: NativeSocialComposerUploadMedia[]; title: string }) => {
    if (!userId) return showNotice("Sign in required.");
    if (socialPostingBlocked) return openPostingRestriction();
    const titleValue = payload.title.trim();
    const contentValue = payload.content.trim();
    if (!titleValue || !contentValue) return showNotice("Oops! Don't leave this blank.");
    if (countWords(contentValue) > MAX_COMPOSER_WORDS) return showNotice("Post is too long.");
    const videoMedia = payload.media.find((item) => item.kind === "video");
    if (videoMedia && !isGoldUser) return showNotice("Video upload is available for huddle＊ members only.");
    if (videoMedia && editingThread?.providerVideoId) return showNotice("Only one video can be added to a post.");
    const uploadedForCleanup: string[] = [];
    const optimisticId = `pending:thread:${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticImageMedia = payload.media.filter((item) => item.kind === "image");
    const optimisticImages = optimisticImageMedia.map((item) => item.uri).filter(Boolean);
    const optimisticImageMetadata = buildNativeSocialImageMetadata(optimisticImageMedia);
    const previousEditingThread = editingThread;
    const optimisticThread: NativeSocialThread = {
      id: previousEditingThread?.id || optimisticId,
      title: titleValue,
      content: contentValue,
      tags: [payload.category || "Social"],
      hashtags: [],
      mentions: previousEditingThread?.mentions || [],
      images: optimisticImages,
      imageMetadata: optimisticImageMetadata,
      createdAt: previousEditingThread?.createdAt || optimisticCreatedAt,
      updatedAt: optimisticCreatedAt,
      userId,
      likes: previousEditingThread?.likes || 0,
      commentCount: previousEditingThread?.commentCount || 0,
      shareCount: previousEditingThread?.shareCount || 0,
      score: previousEditingThread?.score || 0,
      mapId: previousEditingThread?.mapId || null,
      alertType: previousEditingThread?.alertType || null,
      alertDistrict: previousEditingThread?.alertDistrict || null,
      hasAlertLink: previousEditingThread?.hasAlertLink || false,
      isSensitive: payload.isSensitive,
      foundAt: previousEditingThread?.foundAt || null,
      alertState: previousEditingThread?.alertState || "inactive",
      videoProvider: previousEditingThread?.videoProvider || null,
      providerVideoId: previousEditingThread?.providerVideoId || null,
      videoPlaybackUrl: previousEditingThread?.videoPlaybackUrl || null,
      videoEmbedUrl: previousEditingThread?.videoEmbedUrl || null,
      videoThumbnailUrl: previousEditingThread?.videoThumbnailUrl || null,
      videoPreviewUrl: previousEditingThread?.videoPreviewUrl || null,
      videoDurationSeconds: previousEditingThread?.videoDurationSeconds || null,
      videoStatus: previousEditingThread?.videoStatus || null,
      postCountry: previousEditingThread?.postCountry || viewerScope?.countryName || viewerScope?.country || viewerScope?.profileCountryName || viewerScope?.profileCountry || null,
      postCity: previousEditingThread?.postCity || viewerScope?.city || viewerScope?.profileLocationName || null,
      postDistrict: previousEditingThread?.postDistrict || viewerScope?.district || viewerScope?.profileDistrict || null,
      postLanguage: previousEditingThread?.postLanguage || null,
      postLocationSource: previousEditingThread?.postLocationSource || viewerScope?.source || null,
      author: previousEditingThread?.author || {
        displayName: "You",
        socialId: null,
        avatarUrl: null,
        verificationStatus: null,
        locationCountry: null,
        isVerified: false,
        nonSocial: false,
      },
      localStatus: "pending",
    };
    if (__DEV__) console.log("NATIVE_SOCIAL_POST_OPTIMISTIC_START", {
      editing: Boolean(previousEditingThread),
      hasAccessToken: Boolean(accessToken),
      threadId: optimisticThread.id,
    });
    markThreadMutated(optimisticThread.id);
    setThreads((current) => previousEditingThread
      ? current.map((thread) => thread.id === previousEditingThread.id ? optimisticThread : thread)
      : [optimisticThread, ...current]);
    closeComposer();
    try {
      const imageMedia = payload.media.filter((item) => item.kind === "image");
      const previousImageSet = new Set((previousEditingThread?.images || []).map((url) => url.trim()).filter(Boolean));
      const imageUrls = await Promise.all(imageMedia.map(async (media) => {
        if (typeof media.uploadedUrl === "string" && media.uploadedUrl.trim().length > 0) {
          const uploadedUrl = media.uploadedUrl.trim();
          if (!previousImageSet.has(uploadedUrl)) uploadedForCleanup.push(uploadedUrl);
          return uploadedUrl;
        }
        if (media.uri.startsWith("http")) return media.uri;
        const uploadedUrl = await uploadNativeSocialImage(userId, media, "thread", accessToken, currentSessionKey);
        uploadedForCleanup.push(uploadedUrl);
        return uploadedUrl;
      }));
      const imageMetadata = buildNativeSocialImageMetadata(imageMedia.map((media, index) => ({ ...media, uri: imageUrls[index] || media.uploadedUrl || media.uri })));
      const video = videoMedia ? await createNativeSocialVideoUpload(userId, videoMedia, titleValue, accessToken, currentSessionKey) : null;
      const mentions = await resolveNativeSocialMentionsFromText(contentValue, accessToken);
      if (editingThread) {
        const mergedImages = imageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
        markThreadMutated(editingThread.id);
        await updateNativeSocialThread({
          accessToken,
          category: payload.category,
          content: contentValue,
          id: editingThread.id,
          imageMetadata,
          images: mergedImages,
          isSensitive: payload.isSensitive,
          previousImages: editingThread.images,
          sessionKey: currentSessionKey,
          title: titleValue,
          userId,
          video,
        });
        await persistNativeSocialPostMentions(editingThread.id, mentions, accessToken);
        if (mentions.length > 0) await createNativeSocialMentionNotifications(editingThread.id, userId, mentions.map((entry) => entry.mentionedUserId), accessToken, currentSessionKey);
        const freshThread = await fetchNativeSocialThreadById(editingThread.id, accessToken);
        setThreads((current) => {
          const nextThreads = current.map((thread) => thread.id === editingThread.id ? {
            ...thread,
            ...(freshThread || {}),
            title: freshThread?.title ?? titleValue,
            content: freshThread?.content ?? contentValue,
            tags: freshThread?.tags ?? [payload.category],
            images: freshThread?.images ?? mergedImages,
            imageMetadata: freshThread?.imageMetadata ?? imageMetadata,
            isSensitive: freshThread?.isSensitive ?? payload.isSensitive,
            localStatus: undefined,
            mentions,
            ...(video && !freshThread ? {
              videoProvider: "bunny_stream" as const,
              providerVideoId: video.providerVideoId,
              videoPlaybackUrl: video.playbackUrl,
              videoEmbedUrl: video.embedUrl,
              videoThumbnailUrl: video.thumbnailUrl,
              videoPreviewUrl: video.previewUrl,
              videoDurationSeconds: video.duration,
              videoStatus: video.status,
            } : {}),
          } : thread);
          void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, currentSessionKey, feedScopeCountry, sortModeRef.current), {
            rows: nextThreads.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
            cursor: cursorRef.current,
            hasMore: hasMoreRef.current,
          });
          return nextThreads;
        });
        haptic.success();
        showNotice("Post updated.");
      } else {
        const id = await createNativeSocialThread({ accessToken, category: payload.category, content: contentValue, imageMetadata, images: imageUrls, isSensitive: payload.isSensitive, postScope: viewerScope, sessionKey: currentSessionKey, title: titleValue, userId, video });
        if (id) {
          markThreadMutated(id);
          // The post row is committed. Mention persistence, mention notifications and
          // the read-back are all secondary — none of them may roll the post back or
          // trigger the orphan-media cleanup in the catch below.
          try {
            await persistNativeSocialPostMentions(id, mentions, accessToken);
            if (mentions.length > 0) await createNativeSocialMentionNotifications(id, userId, mentions.map((entry) => entry.mentionedUserId), accessToken, currentSessionKey);
          } catch (mentionError) {
            if (__DEV__) console.warn("NATIVE_SOCIAL_POST_MENTION_SYNC_FAILED", {
              threadId: id,
              ...describeNativeSocialError(mentionError),
            });
          }
          const createdThread = await fetchNativeSocialThreadById(id, accessToken).catch(() => null);
          if (createdThread) {
            setThreads((current) => {
              const nextThreads = [createdThread, ...current.filter((thread) => thread.id !== id && thread.id !== optimisticId)];
              void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, currentSessionKey, feedScopeCountry, sortModeRef.current), {
                rows: nextThreads.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
                cursor: cursorRef.current,
                hasMore: hasMoreRef.current,
              });
              return nextThreads;
            });
          } else {
            setThreads((current) => {
              const nextThreads = current.map((thread) => thread.id === optimisticId ? { ...optimisticThread, id, localStatus: undefined } : thread);
              void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, currentSessionKey, feedScopeCountry, sortModeRef.current), {
                rows: nextThreads.slice(0, SOCIAL_FEED_CACHE_ROW_LIMIT),
                cursor: cursorRef.current,
                hasMore: hasMoreRef.current,
              });
              return nextThreads;
            });
          }
          haptic.success();
          showNotice("Thread posted.");
        } else {
          throw new Error("Unable to create thread.");
        }
      }
    } catch (error) {
      if (uploadedForCleanup.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeSocialStorageImages(uploadedForCleanup, userId, accessToken, "social_thread_orphan_upload", currentSessionKey).catch(() => "failed" as const);
        logNativeProtectedActionFailure("[native.social] thread_orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      logNativeProtectedActionFailure("[native.social] submit_thread_failed", error);
      if (__DEV__) console.warn("NATIVE_SOCIAL_POST_OPTIMISTIC_ROLLBACK", {
        editing: Boolean(previousEditingThread),
        threadId: optimisticThread.id,
        ...describeNativeSocialError(error),
      });
      setThreads((current) => previousEditingThread
        ? current.map((thread) => thread.id === previousEditingThread.id ? previousEditingThread : thread)
        : current.filter((thread) => thread.id !== optimisticId));
      showNotice("Not sent yet — your post is still in the composer.");
    }
  }, [accessToken, closeComposer, currentSessionKey, editingThread, feedScopeCountry, isGoldUser, markThreadMutated, openPostingRestriction, refreshAroundMutation, showNotice, socialPostingBlocked, userId, viewerScope]);

  const openNativeShare = useCallback(async (thread: NativeSocialThread) => {
    const share = buildNativeSocialSharePayload(thread);
    try {
      // The post's own photo is attached when it has one: the OS decides which
      // apps appear from the TYPE of the items it is handed, so a link-only
      // share could never list TikTok or Instagram. The link travels alongside
      // it, exactly once — `openNativeShareSheet` owns that rule.
      await openNativeShareSheet({
        imageUrl: thread.images[0] || null,
        text: share.nativeShareText,
        title: share.title,
        url: share.canonicalUrl,
      });
      const count = await recordNativeSocialShare(thread.id, accessToken);
      recordFeedEvent(thread.id, "share");
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, shareCount: count ?? item.shareCount + 1 } : item));
    } catch {
      showNotice("Share canceled.");
    }
  }, [accessToken, recordFeedEvent, showNotice]);

  const toggleSupport = useCallback((thread: NativeSocialThread) => {
    if (!userId) return showNotice("Sign in required.");
    if (blockedUsers.has(thread.userId)) return showNotice("You cannot support this user.");
    const isSupported = supportedThreadIds.has(thread.id);
    if (__DEV__) console.log("NATIVE_SOCIAL_SUPPORT_TAP", {
      hasAccessToken: Boolean(accessToken),
      nextSupported: !isSupported,
      threadId: thread.id,
    });
    if (!isSupported) haptic.selectTab(); // SO5: light tick on like-on; no haptic on like-off
    setSupportedThreadIds((current) => toggleSetValue(current, thread.id));
    setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, likes: Math.max(0, item.likes + (isSupported ? -1 : 1)) } : item));
    void setNativeSocialSupport(thread, userId, isSupported, accessToken, currentSessionKey)
      .then(async (count) => {
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, likes: count } : item));
        if (!isSupported) {
          recordFeedEvent(thread.id, "like");
          if (thread.userId !== userId) {
            try {
              const profile = await fetchNativeProfileSummary(userId, { accessToken, sessionKey: currentSessionKey });
              await upsertNativeSocialNotificationWindow({
                actorId: userId,
                actorName: profile?.profile?.display_name || "Someone",
                category: "social",
                href: `/social?focus=${thread.id}`,
                kind: "like",
                ownerUserId: thread.userId,
                sessionKey: currentSessionKey,
                subjectId: thread.id,
                subjectType: "thread",
                accessToken,
              });
            } catch (notificationError) {
              if (__DEV__) console.warn("NATIVE_SOCIAL_SUPPORT_NOTIFICATION_NON_FATAL", {
                message: notificationError instanceof Error ? notificationError.message : String(notificationError),
                threadId: thread.id,
              });
            }
          }
        }
      })
      .catch((error) => {
        if (__DEV__) console.warn("NATIVE_SOCIAL_SUPPORT_ROLLBACK", {
          message: error instanceof Error ? error.message : String(error),
          rollbackHappened: true,
          threadId: thread.id,
        });
        setSupportedThreadIds((current) => toggleSetValue(current, thread.id));
        refreshAroundMutation();
        showNotice("Unable to update support.");
      });
  }, [accessToken, blockedUsers, currentSessionKey, recordFeedEvent, refreshAroundMutation, showNotice, supportedThreadIds, userId]);

  const confirmDeleteThread = useCallback((thread: NativeSocialThread) => {
    if (!userId || thread.userId !== userId) return;
    setMoreThread(null);
    setMoreThreadAnchor(null);
    setTimeout(() => setDeleteThreadTarget(thread), 0);
  }, [userId]);

  const confirmBlockThreadAuthor = useCallback((thread: NativeSocialThread) => {
    if (!userId || thread.userId === userId) return;
    setMoreThread(null);
    setMoreThreadAnchor(null);
    setTimeout(() => setBlockThreadTarget(thread), 0);
  }, [userId]);

  const executeDeleteThread = useCallback(async () => {
    if (!deleteThreadTarget || !userId || deletingThreadId) return;
    haptic.destructive();
    const thread = deleteThreadTarget;
    const threadId = thread.id;
    const previousThreads = threads;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutMessage = "Delete request timed out. Refresh to confirm deletion.";

    setDeletingThreadId(threadId);
    setDeleteThreadTarget(null);
    setMoreThread(null);
    setMoreThreadAnchor(null);
    if (replyFor === threadId) {
      setReplyFor(null);
      setReplyTargetCommentId(null);
      setReplyComposerAnchorCommentId(null);
    }
    setThreads((current) => current.filter((item) => item.id !== threadId));
    markThreadRemoved(threadId);
    if (__DEV__) console.log("NATIVE_SOCIAL_POST_DELETE_OPTIMISTIC_START", { threadId });
    try {
      const deleteResult = await Promise.race<boolean>([
        deleteNativeSocialThread(thread, userId, accessToken, currentSessionKey).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        }),
        new Promise<boolean>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(timeoutMessage));
          }, DELETE_THREAD_TIMEOUT_MS);
        }),
      ]);
      if (deleteResult) {
        void purgeNativeSocialPersistentCache(userId);
        showNotice("Post deleted.");
      } else {
        showNotice("Post is already deleted.");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === timeoutMessage) {
        showNotice("Delete timed out. Pull to refresh to verify result.");
      } else {
        showNotice("Unable to delete post.");
      }
      if (__DEV__) console.warn("NATIVE_SOCIAL_POST_DELETE_OPTIMISTIC_ROLLBACK", { message, threadId });
      removedThreadIdsRef.current.delete(threadId);
      setThreads(previousThreads);
    } finally {
      setDeletingThreadId((current) => (current === threadId ? null : current));
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [accessToken, currentSessionKey, deleteThreadTarget, deletingThreadId, markThreadRemoved, replyFor, showNotice, threads, userId]);

  const executeBlockThreadAuthor = useCallback(() => {
    if (!blockThreadTarget || !userId) return;
    haptic.destructive();
    const thread = blockThreadTarget;
    const previousThreads = threads;
    const previousBlockedUsers = blockedUsers;
    setBlockThreadTarget(null);
    setBlockedUsers((current) => new Set([...current, thread.userId]));
    markThreadRemoved(thread.id);
    setThreads((current) => current.filter((item) => item.userId !== thread.userId));
    if (__DEV__) console.log("NATIVE_SOCIAL_AUTHOR_BLOCK_OPTIMISTIC_START", { authorId: thread.userId, threadId: thread.id });
    void blockNativeSocialUser(thread.userId, accessToken, userId, currentSessionKey)
      .then(() => {
        void invalidateNativeBlockCascade({ userId });
        recordFeedEvent(thread.id, "block");
      })
      .catch((error) => {
        if (__DEV__) console.warn("NATIVE_SOCIAL_AUTHOR_BLOCK_OPTIMISTIC_ROLLBACK", {
          authorId: thread.userId,
          message: error instanceof Error ? error.message : String(error),
          threadId: thread.id,
        });
        setBlockedUsers(previousBlockedUsers);
        removedThreadIdsRef.current.delete(thread.id);
        setThreads(previousThreads);
        showNotice("Unable to block user right now.");
      });
  }, [accessToken, blockThreadTarget, blockedUsers, currentSessionKey, markThreadRemoved, recordFeedEvent, showNotice, threads, userId]);

  const executeBlockCommentAuthor = useCallback(() => {
    if (!blockCommentTarget || !userId) return;
    haptic.destructive();
    const comment = blockCommentTarget;
    const previousBlockedUsers = blockedUsers;
    const previousHiddenCommentIds = hiddenCommentIds;
    const hiddenByAuthor = Object.values(commentsByThread).flat().filter((entry) => entry.userId === comment.userId).map((entry) => entry.id);
    setBlockCommentTarget(null);
    setBlockedUsers((current) => new Set([...current, comment.userId]));
    setHiddenCommentIds((current) => new Set([...current, ...hiddenByAuthor]));
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_AUTHOR_BLOCK_OPTIMISTIC_START", { authorId: comment.userId, commentId: comment.id });
    void blockNativeSocialUser(comment.userId, accessToken, userId, currentSessionKey)
      .then(() => {
        void invalidateNativeBlockCascade({ userId });
        setMoreCommentTarget(null);
      })
      .catch((error) => {
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_AUTHOR_BLOCK_OPTIMISTIC_ROLLBACK", {
          authorId: comment.userId,
          commentId: comment.id,
          message: error instanceof Error ? error.message : String(error),
        });
        setBlockedUsers(previousBlockedUsers);
        setHiddenCommentIds(previousHiddenCommentIds);
        showNotice("Unable to block user right now.");
      });
  }, [accessToken, blockCommentTarget, blockedUsers, commentsByThread, currentSessionKey, hiddenCommentIds, showNotice, userId]);

  const toggleSaved = useCallback((threadId: string) => {
    if (!userId) {
      showNotice("Sign in required.");
      return;
    }
    haptic.toggleControl();
    const willSave = !storedSets.saved.has(threadId);
    setStoredSets((current) => {
      const nextSaved = toggleSetValue(current.saved, threadId);
      return { ...current, saved: nextSaved };
    });
    void setNativeSocialPostSaved(threadId, willSave, accessToken)
      .then((confirmedSaved) => {
        applyDbPreferences([{ threadId, isSaved: confirmedSaved, isPinned: storedSets.pinned.has(threadId), pinnedAt: storedSets.pinnedAt.get(threadId) || null }], "merge");
        if (confirmedSaved) recordFeedEvent(threadId, "save");
      })
      .catch(() => {
        setStoredSets((current) => ({ ...current, saved: toggleSetValue(current.saved, threadId) }));
        showNotice("Unable to update saved post.");
      });
  }, [accessToken, applyDbPreferences, recordFeedEvent, showNotice, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, userId]);

  const togglePinned = useCallback((threadId: string) => {
    if (!userId) {
      showNotice("Sign in required.");
      return;
    }
    haptic.toggleControl();
    const willPin = !storedSets.pinned.has(threadId);
    const rollbackPinnedAt = storedSets.pinnedAt.get(threadId) || null;
    if (willPin && storedSets.pinned.size >= 3) {
      showNotice("You can pin up to 3 posts.");
      return;
    }
    setStoredSets((current) => {
      const nextPinned = toggleSetValue(current.pinned, threadId);
      const nextPinnedAt = new Map(current.pinnedAt);
      if (willPin) nextPinnedAt.set(threadId, new Date().toISOString());
      else nextPinnedAt.delete(threadId);
      return { ...current, pinned: nextPinned, pinnedAt: nextPinnedAt };
    });
    void setNativeSocialPostPinned(threadId, willPin, accessToken)
      .then((preference) => {
        applyDbPreferences([{ ...preference, isSaved: storedSets.saved.has(threadId) }], "merge");
      })
      .catch((error) => {
        setStoredSets((current) => {
          const nextPinned = toggleSetValue(current.pinned, threadId);
          const nextPinnedAt = new Map(current.pinnedAt);
          if (rollbackPinnedAt) nextPinnedAt.set(threadId, rollbackPinnedAt);
          else nextPinnedAt.delete(threadId);
          return { ...current, pinned: nextPinned, pinnedAt: nextPinnedAt };
        });
        const message = error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "")
            : String(error);
        showNotice(message.includes("native_social_pin_limit_reached") ? "You can pin up to 3 posts." : "Unable to update pinned post.");
      });
  }, [accessToken, applyDbPreferences, showNotice, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, userId]);

  const clearReplyComposer = useCallback(() => {
    setReplyFor(null);
    setReplyTargetCommentId(null);
    setReplyComposerAnchorCommentId(null);
    setReplyDraft("");
    setReplyMedia([]);
    setEditingComment(null);
  }, []);

  const loadCommentsForThread = useCallback((targetThread: NativeSocialThread) => {
    if (!userId || !targetThread.id || commentsLoadingThreads.has(targetThread.id)) return;

    const cacheKey = nativeSocialCommentsCacheKey(userId, currentSessionKey, targetThread);
    setCommentsLoadingThreads((current) => new Set([...current, targetThread.id]));
    setCommentLoadErrors((current) => {
      const next = { ...current };
      delete next[targetThread.id];
      return next;
    });

    void (async () => {
      const requestSessionKey = currentSessionKey;
      const cached = await readNativeSocialPersistentCache<NativeSocialComment[]>(cacheKey, SOCIAL_COMMENTS_CACHE_MAX_AGE_MS);
      if (socialSessionKeyRef.current !== requestSessionKey) return;
      if (cached) {
        setCommentsByThread((current) => {
          const nextComments = applyCommentMutationTruth(targetThread.id, cached, current[targetThread.id] || []);
          syncCommentSupportFromRows(nextComments);
          return { ...current, [targetThread.id]: nextComments };
        });
        setThreads((current) => current.map((threadItem) => (
          threadItem.id === targetThread.id && cached.length > threadItem.commentCount ? { ...threadItem, commentCount: cached.length } : threadItem
        )));
      }

      const comments = await fetchNativeSocialComments(targetThread.id, { accessToken, limit: SOCIAL_INITIAL_COMMENT_LIMIT });
      if (socialSessionKeyRef.current !== requestSessionKey) return;
      setCommentsByThread((current) => {
        const nextComments = applyCommentMutationTruth(targetThread.id, comments, current[targetThread.id] || []);
        syncCommentSupportFromRows(nextComments);
        void writeNativeSocialPersistentCache(cacheKey, withoutPendingSocialComments(nextComments));
        return { ...current, [targetThread.id]: nextComments };
      });
      setCommentsCanLoadOlderByThread((current) => ({ ...current, [targetThread.id]: comments.length === SOCIAL_INITIAL_COMMENT_LIMIT }));
      setThreads((current) => current.map((threadItem) => (
        threadItem.id === targetThread.id && comments.length > threadItem.commentCount ? { ...threadItem, commentCount: comments.length } : threadItem
      )));
    })()
      .catch(() => setCommentLoadErrors((current) => ({ ...current, [targetThread.id]: "Comments could not load. Please try again." })))
      .finally(() => {
        setCommentsLoadingThreads((current) => {
          const next = new Set(current);
          next.delete(targetThread.id);
          return next;
        });
      });
  }, [accessToken, applyCommentMutationTruth, commentsLoadingThreads, currentSessionKey, syncCommentSupportFromRows, userId]);

  const loadOlderCommentsForThread = useCallback((targetThread: NativeSocialThread) => {
    if (!userId || !targetThread.id || olderCommentsLoadingThreads.has(targetThread.id)) return;
    const existing = commentsByThread[targetThread.id] || [];
    const beforeCreatedAt = existing[0]?.createdAt || null;
    if (!beforeCreatedAt) return;
    const requestSessionKey = currentSessionKey;
    setOlderCommentsLoadingThreads((current) => new Set([...current, targetThread.id]));
    void fetchNativeSocialComments(targetThread.id, { accessToken, beforeCreatedAt, limit: SOCIAL_OLDER_COMMENT_LIMIT })
      .then((older) => {
        if (socialSessionKeyRef.current !== requestSessionKey) return;
        syncCommentSupportFromRows(older);
        setCommentsByThread((current) => {
          const nextComments = applyCommentMutationTruth(targetThread.id, mergeNativeSocialComments(current[targetThread.id] || [], older), current[targetThread.id] || []);
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, targetThread), withoutPendingSocialComments(nextComments));
          return { ...current, [targetThread.id]: nextComments };
        });
        setCommentsCanLoadOlderByThread((current) => ({ ...current, [targetThread.id]: older.length === SOCIAL_OLDER_COMMENT_LIMIT }));
      })
      .catch(() => setCommentLoadErrors((current) => ({ ...current, [targetThread.id]: "Older replies could not load. Please try again." })))
      .finally(() => {
        setOlderCommentsLoadingThreads((current) => {
          const next = new Set(current);
          next.delete(targetThread.id);
          return next;
        });
      });
  }, [accessToken, applyCommentMutationTruth, commentsByThread, currentSessionKey, olderCommentsLoadingThreads, syncCommentSupportFromRows, userId]);

  const openThreadReplies = useCallback((thread: NativeSocialThread) => {
    setExpandedReplies((current) => new Set([...current, thread.id]));
    recordFeedEvent(thread.id, "open_comments");
    if (commentsByThread[thread.id] === undefined) loadCommentsForThread(thread);
    if (socialPostingBlocked) {
      openPostingRestriction();
      return;
    }
    setReplyFor(thread.id);
    setReplyTargetCommentId(null);
    setReplyComposerAnchorCommentId(null);
    setReplyDraft("");
    setReplyMedia([]);
    setEditingComment(null);
    queueCommentSnap(thread.id, "composer", null);
  }, [commentsByThread, loadCommentsForThread, openPostingRestriction, queueCommentSnap, recordFeedEvent, socialPostingBlocked]);

  const scheduleRealtimeCommentsRefresh = useCallback((threadId: string) => {
    if (!threadId || realtimeCommentRefreshTimersRef.current.has(threadId)) return;
    const run = () => {
      realtimeCommentRefreshTimersRef.current.delete(threadId);
      if (realtimeCommentRefreshInFlightRef.current.has(threadId)) return;
      realtimeCommentRefreshInFlightRef.current.add(threadId);
      const requestSessionKey = currentSessionKey;
      void fetchNativeSocialComments(threadId, { accessToken, limit: SOCIAL_INITIAL_COMMENT_LIMIT })
        .then((comments) => {
          if (socialSessionKeyRef.current !== requestSessionKey) return;
          realtimeCommentRefreshLastAtRef.current.set(threadId, Date.now());
          setCommentsByThread((current) => {
            const nextComments = applyCommentMutationTruth(threadId, comments, current[threadId] || []);
            syncCommentSupportFromRows(nextComments);
            const targetThread = threadsByIdRef.current.get(threadId);
            if (userId && targetThread) void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, targetThread), withoutPendingSocialComments(nextComments));
            return { ...current, [threadId]: nextComments };
          });
          setCommentsCanLoadOlderByThread((current) => ({ ...current, [threadId]: comments.length === SOCIAL_INITIAL_COMMENT_LIMIT }));
          setThreads((current) => current.map((thread) => (
            thread.id === threadId ? { ...thread, commentCount: comments.length } : thread
          )));
        })
        .catch(() => undefined)
        .finally(() => {
          realtimeCommentRefreshInFlightRef.current.delete(threadId);
        });
    };
    const elapsed = Date.now() - (realtimeCommentRefreshLastAtRef.current.get(threadId) || 0);
    const delay = Math.max(0, SOCIAL_REALTIME_REFRESH_COOLDOWN_MS - elapsed);
    realtimeCommentRefreshTimersRef.current.set(threadId, setTimeout(run, delay));
  }, [accessToken, applyCommentMutationTruth, currentSessionKey, syncCommentSupportFromRows, userId]);

  useEffect(() => {
    if (expandedReplies.size === 0) return undefined;

    const threadIds = Array.from(expandedReplies).filter(Boolean).sort();
    if (threadIds.length === 0) return undefined;

    const handle = createSingleRealtimeChannel(`native-social-comments:${threadIds.join(",")}`, (channel) => {
      threadIds.forEach((threadId) => {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "thread_comments", filter: `thread_id=eq.${threadId}` },
          () => {
            scheduleRealtimeCommentsRefresh(threadId);
          },
        );
      });
      return channel;
    });

    return () => {
      void handle.dispose();
    };
  }, [expandedReplies, scheduleRealtimeCommentsRefresh]);

  const toggleCommentBranch = useCallback((
    thread: NativeSocialThread,
    item: NativeSocialThreadedReply,
    tree: ReturnType<typeof buildNativeReplyTree>,
  ) => {
    if (item.depth >= 2 || item.directChildCount === 0) return;
    const branchIds = [item.comment.id, ...tree.collectDescendantIds(item.comment.id)];
    const isExpanded = expandedCommentBranches.has(item.comment.id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // SO11: smooth reply branch expand/collapse
    setExpandedCommentBranches((current) => {
      const next = new Set(current);
      if (isExpanded) {
        branchIds.forEach((id) => next.delete(id));
      } else {
        next.add(item.comment.id);
      }
      return next;
    });
    if (isExpanded && replyFor === thread.id && (
      (replyTargetCommentId && branchIds.includes(replyTargetCommentId))
      || (replyComposerAnchorCommentId && branchIds.includes(replyComposerAnchorCommentId))
    )) {
      clearReplyComposer();
    }
  }, [clearReplyComposer, expandedCommentBranches, replyComposerAnchorCommentId, replyFor, replyTargetCommentId]);

  const handleReplyPress = useCallback((thread: NativeSocialThread, item: NativeSocialThreadedReply, tree: ReturnType<typeof buildNativeReplyTree>) => {
    if (socialPostingBlocked) {
      openPostingRestriction();
      return;
    }
    const canExpandBranch = item.depth < 2 && item.directChildCount > 0;
    const branchIds = [item.comment.id, ...tree.collectDescendantIds(item.comment.id)];
    const branchIsExpanded = expandedCommentBranches.has(item.comment.id);
    const composerAnchorCommentId = canExpandBranch
      ? item.depth === 1
        ? tree.getLastDescendantId(item.comment.id)
        : tree.getLastChildId(item.comment.id)
      : item.comment.id;
    const composerIsActive = replyFor === thread.id;
    const composerTargetsThisComment = composerIsActive && replyTargetCommentId === item.comment.id;
    const composerTargetsThisAnchor = composerIsActive && replyComposerAnchorCommentId === composerAnchorCommentId && !canExpandBranch;
    if (composerTargetsThisComment || composerTargetsThisAnchor) {
      queueCommentSnap(thread.id, "composer", composerAnchorCommentId);
      setTimeout(() => replyInputRef.current?.focus(), COMMENT_SNAP_DELAY_MS);
      return;
    }
    if (canExpandBranch) {
      if (branchIsExpanded) {
        setExpandedCommentBranches((current) => {
          const next = new Set(current);
          branchIds.forEach((id) => next.delete(id));
          return next;
        });
        if (replyFor === thread.id && (
          (replyTargetCommentId && branchIds.includes(replyTargetCommentId))
          || (replyComposerAnchorCommentId && branchIds.includes(replyComposerAnchorCommentId))
        )) {
          clearReplyComposer();
        }
        return;
      }
      setExpandedCommentBranches((current) => new Set([...current, item.comment.id]));
    }
    setExpandedReplies((current) => new Set([...current, thread.id]));
    setReplyFor(thread.id);
    setReplyTargetCommentId(item.comment.id);
    setReplyComposerAnchorCommentId(composerAnchorCommentId);
    setReplyDraft("");
    setReplyMedia([]);
    setEditingComment(null);
    queueCommentSnap(thread.id, "composer", canExpandBranch ? composerAnchorCommentId : item.comment.id);
    setTimeout(() => replyInputRef.current?.focus(), COMMENT_SNAP_DELAY_MS);
  }, [clearReplyComposer, expandedCommentBranches, openPostingRestriction, queueCommentSnap, replyComposerAnchorCommentId, replyFor, replyTargetCommentId, socialPostingBlocked]);

  const pickReplyMedia = useCallback(async () => {
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: Math.max(1, MAX_COMPOSER_MEDIA - replyMedia.length),
      });
    } catch (error) {
      showNotice(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
    queueCommentSnap(replyFor || "", "composer", replyComposerAnchorCommentId);
    if (result.canceled) return;
    const incoming = result.assets.map((asset) => ({
      durationSeconds: null,
      height: asset.height,
      kind: "image" as const,
      mimeType: asset.mimeType,
      name: asset.fileName,
      size: asset.fileSize,
      uri: asset.uri,
      width: asset.width,
    }));
    setReplyMedia((current) => [...current, ...incoming].slice(0, MAX_COMPOSER_MEDIA));
  }, [queueCommentSnap, replyComposerAnchorCommentId, replyFor, replyMedia.length, showNotice]);

  useEffect(() => {
    activeComposerThreadIdRef.current = replyFor;
  }, [replyFor]);

  const submitReply = useCallback(async (thread: NativeSocialThread) => {
    if (!userId) return showNotice("Sign in required.");
    if (socialPostingBlocked) return openPostingRestriction();
    const content = replyDraft.trim();
    if (!content) return;
    if (countWords(content) > MAX_COMPOSER_WORDS) return showNotice("Reply is too long.");
    if (replySubmittingByThread.has(thread.id)) return;
    const submittedParentCommentId = replyTargetCommentId;
    const submitFlightKey = buildNativeReplyFlightKey(thread.id, submittedParentCommentId, content, replyMedia);
    if (replySubmitLocksRef.current.has(submitFlightKey)) return;
    const parentComment = submittedParentCommentId ? (commentsByThread[thread.id] || []).find((comment) => comment.id === submittedParentCommentId) || null : null;
    // A transient failure of the block lookup must never swallow the reply. Only a
    // confirmed block stops the submit; an unreachable check falls through and lets
    // the server-side visibility gate be the authority.
    const replyBlockedByRelationship = async (targetUserId: string | null | undefined) => {
      if (!targetUserId) return false;
      try {
        return await areNativeSocialUsersBlocked(userId, targetUserId, accessToken);
      } catch {
        return false;
      }
    };
    if (parentComment && await replyBlockedByRelationship(parentComment.userId)) return showNotice("You cannot reply to this user.");
    if (await replyBlockedByRelationship(thread.userId)) return showNotice("You cannot reply to this user.");
    replySubmitLocksRef.current.add(submitFlightKey);
    setReplySubmittingByThread((current) => new Set([...current, thread.id]));
    const uploadedReplyImageUrls: string[] = [];
    const previousEditingComment = editingComment;
    const previousEditingComments = previousEditingComment ? commentsByThread[previousEditingComment.threadId] || [] : [];
    const previousEditingCommentImages = previousEditingComment?.comment.images || [];
    const optimisticId = previousEditingComment?.comment.id || nextOptimisticCommentId();
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticImageMedia = replyMedia.filter((item) => item.kind === "image");
    const optimisticImages = optimisticImageMedia.map((item) => item.uri).filter(Boolean);
    const optimisticImageMetadata = buildNativeSocialImageMetadata(optimisticImageMedia);
    const optimisticComment: NativeSocialComment = {
      id: optimisticId,
      threadId: thread.id,
      parentCommentId: submittedParentCommentId,
      content,
      images: optimisticImages,
      imageMetadata: optimisticImageMetadata,
      createdAt: previousEditingComment?.comment.createdAt || optimisticCreatedAt,
      updatedAt: optimisticCreatedAt,
      userId,
      author: previousEditingComment?.comment.author || {
        displayName: "You",
        socialId: null,
        avatarUrl: null,
        verificationStatus: null,
        locationCountry: null,
        isVerified: false,
        nonSocial: false,
      },
      mentions: previousEditingComment?.comment.mentions || [],
      supportCount: previousEditingComment?.comment.supportCount || 0,
      viewerSupported: previousEditingComment?.comment.viewerSupported || false,
      localStatus: "pending",
    };
    markCommentMutated(thread.id, optimisticId);
    setCommentsByThread((current) => {
      const existing = current[thread.id] || [];
      const nextComments = previousEditingComment
        ? existing.map((comment) => comment.id === previousEditingComment.comment.id ? optimisticComment : comment)
        : dedupeNativeSocialComments([...existing, optimisticComment]);
      return { ...current, [thread.id]: nextComments };
    });
    if (!previousEditingComment) {
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: item.commentCount + 1 } : item));
    }
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_OPTIMISTIC_START", {
      commentId: optimisticId,
      editing: Boolean(previousEditingComment),
      hasAccessToken: Boolean(accessToken),
      threadId: thread.id,
    });
    try {
      if (editingComment) {
        const mentions = await resolveNativeSocialMentionsFromText(content, accessToken);
        const nextCommentImages = replyMedia.filter((item) => item.kind === "image").map((item) => item.uri).filter(Boolean);
        const nextCommentImageMetadata = buildNativeSocialImageMetadata(replyMedia.filter((item) => item.kind === "image"));
        markCommentMutated(editingComment.threadId, editingComment.comment.id);
        await updateNativeSocialComment(editingComment.comment.id, userId, content, nextCommentImages, previousEditingCommentImages, accessToken, currentSessionKey, nextCommentImageMetadata);
        // The edit is committed. Mention re-sync is secondary and must not roll it back.
        try {
          await replaceNativeSocialReplyMentions(editingComment.comment.id, mentions, accessToken);
        } catch (mentionError) {
          if (__DEV__) console.warn("NATIVE_SOCIAL_REPLY_EDIT_MENTION_SYNC_FAILED", {
            commentId: editingComment.comment.id,
            ...describeNativeSocialError(mentionError),
          });
        }
        setCommentsByThread((current) => {
          const nextComments = (current[editingComment.threadId] || []).map((comment) => (
            comment.id === editingComment.comment.id ? { ...comment, content, images: nextCommentImages, imageMetadata: nextCommentImageMetadata, mentions, localStatus: undefined } : comment
          ));
          const targetThread = threads.find((thread) => thread.id === editingComment.threadId);
          if (targetThread) void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, targetThread), withoutPendingSocialComments(nextComments));
          return { ...current, [editingComment.threadId]: nextComments };
        });
        showNotice("Reply updated.");
        clearReplyComposer();
        return;
      }
      const replyImageMedia = replyMedia.filter((item) => item.kind === "image");
      for (const media of replyImageMedia) {
        uploadedReplyImageUrls.push(await uploadNativeSocialImage(userId, media, "reply", accessToken, currentSessionKey));
      }
      const uploadedReplyImageMetadata = buildNativeSocialImageMetadata(replyImageMedia.map((media, index) => ({ ...media, uri: uploadedReplyImageUrls[index] || media.uri })));
      const id = await createNativeSocialComment({
        accessToken,
        content,
        imageMetadata: uploadedReplyImageMetadata,
        images: uploadedReplyImageUrls,
        parentCommentId: submittedParentCommentId,
        sessionKey: currentSessionKey,
        threadId: thread.id,
        userId,
      });
      if (!id) throw new Error("Unable to post reply.");
      markCommentMutated(thread.id, id);
      // The optimistic row is superseded by `id`. Leaving its pending id in the
      // mutated set makes applyCommentMutationTruth re-add a row the server will
      // never return, which is how a stale "pending:comment:…" key came back and
      // collided with the real one.
      mutatedCommentIdsByThreadRef.current.get(thread.id)?.delete(optimisticId);
      // The reply row is committed from here on. Mentions, profile lookup and
      // notification fan-out are all secondary: a failure in any of them must
      // never surface as a failed reply, because the reply did post.
      let mentions: NativeSocialMentionEntry[] = [];
      try {
        // Costs nothing when the text has no "@" — it returns early without a request.
        mentions = await resolveNativeSocialMentionsFromText(content, accessToken);
      } catch (mentionError) {
        mentions = [];
        if (__DEV__) console.warn("NATIVE_SOCIAL_REPLY_MENTION_RESOLVE_FAILED", describeNativeSocialError(mentionError));
      }
      // Mention fan-out is for other people's notifications; the composer must not
      // wait on it. Fire and forget.
      if (mentions.length > 0) {
        const mentionedIds = mentions.map((entry) => entry.mentionedUserId);
        void (async () => {
          try {
            await persistNativeSocialReplyMentions(id, mentions, accessToken);
            await createNativeSocialMentionNotifications(thread.id, userId, mentionedIds, accessToken, currentSessionKey);
          } catch (mentionError) {
            if (__DEV__) console.warn("NATIVE_SOCIAL_REPLY_MENTION_SYNC_FAILED", describeNativeSocialError(mentionError));
          }
        })();
      }
      let profile: Awaited<ReturnType<typeof fetchNativeProfileSummary>> | null = null;
      try {
        profile = userId ? await fetchNativeProfileSummary(userId, { accessToken, sessionKey: currentSessionKey }) : null;
      } catch (profileError) {
        if (__DEV__) console.warn("NATIVE_SOCIAL_REPLY_AUTHOR_SUMMARY_FAILED", {
          commentId: id,
          ...describeNativeSocialError(profileError),
        });
      }
      const actorName = profile?.profile?.display_name || "Someone";
      void (async () => {
        try {
          if (thread.userId && thread.userId !== userId) {
          await upsertNativeSocialNotificationWindow({
            actorId: userId,
            actorName,
            category: "social",
            href: `/social?focus=${thread.id}`,
            kind: "comment",
            ownerUserId: thread.userId,
            sessionKey: currentSessionKey,
            subjectId: thread.id,
            subjectType: "thread",
            accessToken,
          });
        }
        if (parentComment?.userId && parentComment.userId !== userId && parentComment.userId !== thread.userId) {
          await upsertNativeSocialNotificationWindow({
            actorId: userId,
            actorName,
            category: "social",
            href: `/social?focus=${thread.id}`,
            kind: "reply",
            ownerUserId: parentComment.userId,
            sessionKey: currentSessionKey,
            subjectId: parentComment.id,
            subjectType: "comment",
            accessToken,
          });
        }
      } catch (notifyError) {
        if (__DEV__) console.warn("NATIVE_SOCIAL_REPLY_NOTIFY_FAILED", {
          commentId: id,
          ...describeNativeSocialError(notifyError),
        });
      }
      })();
      const optimisticCreatedAt = new Date().toISOString();
      const optimistic: NativeSocialComment = {
        id,
        threadId: thread.id,
        parentCommentId: submittedParentCommentId,
        content,
        images: uploadedReplyImageUrls,
        imageMetadata: uploadedReplyImageMetadata,
        createdAt: optimisticCreatedAt,
        updatedAt: optimisticCreatedAt,
        userId,
        author: {
          displayName: profile?.profile?.display_name || "You",
          socialId: profile?.profile?.social_id || null,
          avatarUrl: profile?.profile?.avatar_url || null,
          verificationStatus: profile?.profile?.verification_status || null,
          locationCountry: typeof profile?.profile?.location_country === "string" ? profile.profile.location_country : null,
          isVerified: isNativeVerifiedProfile(profile?.profile),
          nonSocial: false,
        },
        mentions,
        supportCount: 0,
        viewerSupported: false,
      };
      let nextCommentCount = 0;
      setCommentsByThread((current) => {
        const existing = current[thread.id] || [];
        const uploadedKey = uploadedReplyImageUrls.join("\n");
        const deduped = existing.filter((comment) => {
          if (comment.id === optimisticId) return false;
          if (comment.id === id) return false;
          if (comment.userId !== userId) return true;
          if ((comment.parentCommentId || null) !== (submittedParentCommentId || null)) return true;
          if (comment.content !== content) return true;
          return comment.images.join("\n") !== uploadedKey;
        });
        const nextComments = [...deduped, optimistic];
        nextCommentCount = nextComments.length;
        void purgeNativeSocialPersistentCache(userId, { commentsOnlyForThreadId: thread.id });
        void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, thread), withoutPendingSocialComments(nextComments));
        return { ...current, [thread.id]: nextComments };
      });
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: Math.max(item.commentCount, nextCommentCount || item.commentCount) } : item));
      if (submittedParentCommentId) setExpandedCommentBranches((current) => new Set([...current, submittedParentCommentId]));
      haptic.success();
      recordFeedEvent(thread.id, "comment");
      clearReplyComposer();
      queueCommentSnap(thread.id, "composer", id);
    } catch (error) {
      if (!editingComment && uploadedReplyImageUrls.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeSocialStorageImages(uploadedReplyImageUrls, userId, accessToken, "social_reply_orphan_upload", currentSessionKey).catch(() => "failed" as const);
        logNativeProtectedActionFailure("[native.social] reply_orphan_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: getNativeProtectedActionResult(error)?.stage || "domain_save",
          originalError: getNativeProtectedActionResult(error)?.originalError || error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      }
      logNativeProtectedActionFailure("[native.social] submit_reply_failed", error);
      if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_OPTIMISTIC_ROLLBACK", {
        commentId: optimisticId,
        editing: Boolean(previousEditingComment),
        threadId: thread.id,
        ...describeNativeSocialError(error),
      });
      if (previousEditingComment) {
        mutatedCommentIdsByThreadRef.current.get(previousEditingComment.threadId)?.delete(previousEditingComment.comment.id);
        setCommentsByThread((current) => ({ ...current, [previousEditingComment.threadId]: previousEditingComments }));
      } else {
        // Nothing was committed, so remove the placeholder outright rather than
        // leaving a stamped ghost in the thread. The composer still holds the
        // draft and media, so the reply is one tap away from being sent again.
        mutatedCommentIdsByThreadRef.current.get(thread.id)?.delete(optimisticId);
        setCommentsByThread((current) => ({
          ...current,
          [thread.id]: (current[thread.id] || []).filter((comment) => comment.id !== optimisticId),
        }));
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: Math.max(0, item.commentCount - 1) } : item));
      }
      showNotice(editingComment ? "Not saved yet — your edit is still in the box." : "Not sent yet — your reply is still in the box.");
    } finally {
      replySubmitLocksRef.current.delete(submitFlightKey);
      setReplySubmittingByThread((current) => {
        const next = new Set(current);
        next.delete(thread.id);
        return next;
      });
    }
  }, [accessToken, clearReplyComposer, commentsByThread, currentSessionKey, editingComment, markCommentMutated, openPostingRestriction, queueCommentSnap, recordFeedEvent, replyDraft, replyMedia, replySubmittingByThread, replyTargetCommentId, showNotice, socialPostingBlocked, threads, userId]);

  const deleteInlineComment = useCallback((thread: NativeSocialThread, comment: NativeSocialComment) => {
    if (!userId || comment.userId !== userId) return;
    const previousComments = commentsByThread[thread.id] || [];
    markCommentRemoved(thread.id, comment.id);
    setCommentsByThread((current) => ({
      ...current,
      [thread.id]: (current[thread.id] || []).filter((entry) => entry.id !== comment.id),
    }));
    setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: Math.max(0, item.commentCount - 1) } : item));
    if (replyTargetCommentId === comment.id) clearReplyComposer();
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_DELETE_OPTIMISTIC_START", { commentId: comment.id, threadId: thread.id });
    void deleteNativeSocialComment(comment.id, comment.images, userId, accessToken, currentSessionKey)
      .then(() => {
        setCommentsByThread((current) => {
          const nextComments = (current[thread.id] || []).filter((entry) => entry.id !== comment.id);
          void purgeNativeSocialPersistentCache(userId, { commentsOnlyForThreadId: thread.id });
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, thread), withoutPendingSocialComments(nextComments));
          return { ...current, [thread.id]: nextComments };
        });
      })
      .catch((error) => {
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_DELETE_OPTIMISTIC_ROLLBACK", {
          commentId: comment.id,
          message: error instanceof Error ? error.message : String(error),
          threadId: thread.id,
        });
        removedCommentIdsByThreadRef.current.get(thread.id)?.delete(comment.id);
        setCommentsByThread((current) => ({ ...current, [thread.id]: previousComments }));
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: item.commentCount + 1 } : item));
        showNotice("Unable to delete reply.");
      });
  }, [accessToken, clearReplyComposer, commentsByThread, currentSessionKey, markCommentRemoved, replyTargetCommentId, showNotice, userId]);

  const toggleCommentSupport = useCallback((thread: NativeSocialThread, comment: NativeSocialComment) => {
    if (!userId) {
      showNotice("Sign in required.");
      return;
    }
    const requestSessionKey = currentSessionKey;
    const wasSupported = likedCommentIds.has(comment.id) || comment.viewerSupported;
    const nextSupported = !wasSupported;
    const previousCount = Math.max(0, comment.supportCount || 0);
    const optimisticCount = Math.max(0, previousCount + (nextSupported ? 1 : -1));
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_SUPPORT_TAP", {
      commentId: comment.id,
      hasAccessToken: Boolean(accessToken),
      nextSupported,
      threadId: thread.id,
    });
    if (nextSupported) haptic.selectTab();

    setLikedCommentIds((current) => {
      const next = new Set(current);
      if (nextSupported) next.add(comment.id);
      else next.delete(comment.id);
      return next;
    });
    setCommentsByThread((current) => {
      const nextComments = applyCommentSupportState(current[thread.id] || [], comment.id, nextSupported, optimisticCount);
      void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), withoutPendingSocialComments(nextComments));
      return { ...current, [thread.id]: nextComments };
    });

    void setNativeSocialCommentSupport(comment.id, nextSupported, accessToken, userId, currentSessionKey)
      .then(async (result) => {
        if (socialSessionKeyRef.current !== requestSessionKey) return;
        if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_SUPPORT_RPC_RESULT", {
          commentId: comment.id,
          finalSupportCount: result.supportCount,
          finalViewerSupported: result.supported,
          rollbackHappened: false,
          threadId: thread.id,
        });
        setLikedCommentIds((current) => {
          const next = new Set(current);
          if (result.supported) next.add(comment.id);
          else next.delete(comment.id);
          return next;
        });
        setCommentsByThread((current) => {
          const nextComments = applyCommentSupportState(current[thread.id] || [], comment.id, result.supported, result.supportCount);
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), withoutPendingSocialComments(nextComments));
          return { ...current, [thread.id]: nextComments };
        });
        if (nextSupported && result.supported && comment.userId !== userId) {
          try {
            const profile = await fetchNativeProfileSummary(userId, { accessToken, sessionKey: currentSessionKey });
            await upsertNativeSocialNotificationWindow({
              actorId: userId,
              actorName: profile?.profile?.display_name || "Someone",
              category: "social",
              href: `/social?focus=${thread.id}`,
              kind: "comment_like",
              ownerUserId: comment.userId,
              sessionKey: currentSessionKey,
              subjectId: comment.id,
              subjectType: "comment",
              accessToken,
            });
          } catch (notificationError) {
            if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_SUPPORT_NOTIFICATION_NON_FATAL", {
              commentId: comment.id,
              message: notificationError instanceof Error ? notificationError.message : String(notificationError),
              threadId: thread.id,
            });
          }
        }
      })
      .catch((error) => {
        if (socialSessionKeyRef.current !== requestSessionKey) return;
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_SUPPORT_ROLLBACK", {
          commentId: comment.id,
          message: error instanceof Error ? error.message : String(error),
          rollbackHappened: true,
          threadId: thread.id,
        });
        setLikedCommentIds((current) => {
          const next = new Set(current);
          if (wasSupported) next.add(comment.id);
          else next.delete(comment.id);
          return next;
        });
        setCommentsByThread((current) => {
          const nextComments = applyCommentSupportState(current[thread.id] || [], comment.id, wasSupported, previousCount);
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), withoutPendingSocialComments(nextComments));
          return { ...current, [thread.id]: nextComments };
        });
        showNotice("Unable to update reply support.");
      });
  }, [accessToken, currentSessionKey, likedCommentIds, showNotice, userId]);

  const renderItem = useCallback(({ item }: { item: NativeSocialThread }) => {
    const tree = buildNativeReplyTree(commentsByThread[item.id] || [], expandedCommentBranches, hiddenCommentIds);
    const threadRef = getViewNodeRef(threadNodeRefs, item.id);
    const commentPanelRef = getViewNodeRef(commentPanelNodeRefs, item.id);
    const replyComposerRef = getViewNodeRef(replyComposerNodeRefs, `${item.id}:composer`);
    return (
      <View ref={threadRef} style={highlightedThreadId === item.id ? styles.focusedThreadFrame : null}>
        <NativeSocialFeedCard
          expanded={expandedIds.has(item.id)}
          linkPreview={(() => {
            const url = extractNativeSocialFirstHttpUrl(item.content);
            return url ? linkPreviewByUrl[url] || null : null;
          })()}
          pinned={storedSets.pinned.has(item.id)}
          saved={storedSets.saved.has(item.id)}
          supported={supportedThreadIds.has(item.id)}
          thread={item}
          onOpenMap={() => {
            if (item.mapId && userId) {
              // Start the canonical detail request before navigation. Map reuses
              // this exact in-flight request, so the sheet is not gated by a
              // duplicate cold fetch after the route transition.
              void fetchNativeMapAlertById(item.mapId, userId, {
                accessToken,
                sessionKey: currentSessionKey,
                source: "alert",
              }).catch(() => undefined);
            }
            onNavigate(item.mapId ? `/map?alert=${encodeURIComponent(item.mapId)}` : `/map?thread=${encodeURIComponent(item.id)}`);
          }}
          onOpenExternalLink={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
          onOpenProfile={(profileUserId) => {
            recordFeedEvent(item.id, "profile_view");
            openVisibleProfile(profileUserId || item.userId, profileUserId && profileUserId !== item.userId ? null : item.author);
          }}
          commentsOpen={expandedReplies.has(item.id)}
          onOpenComments={() => {
            if (expandedReplies.has(item.id)) {
              setExpandedReplies((current) => {
                const next = new Set(current);
                next.delete(item.id);
                return next;
              });
              clearReplyComposer();
            } else {
              openThreadReplies(item);
            }
          }}
          onOpenMore={(event) => {
            setMoreThreadAnchor(getActionMenuAnchor(event));
            setMoreThread(item);
          }}
          onOpenShare={() => setShareThread(item)}
          onOpenSupport={() => toggleSupport(item)}
          onMediaGestureActiveChange={(gestureActive) => {
            carouselGestureActiveRef.current = gestureActive;
          }}
          onOpenWebThread={() => openThreadReplies(item)}
          onToggleExpanded={() => {
            setExpandedIds((current) => {
              const willExpand = !current.has(item.id);
              if (willExpand) recordFeedEvent(item.id, "expand_post");
              return toggleSetValue(current, item.id);
            });
          }}
          onTogglePinned={() => togglePinned(item.id)}
          onToggleSaved={() => toggleSaved(item.id)}
        />
        {expandedReplies.has(item.id) ? (
          <NativeSocialInlineReplies
            accessToken={accessToken}
            currentUserId={userId}
            editingComment={editingComment}
            error={commentLoadErrors[item.id]}
            likedCommentIds={likedCommentIds}
            linkPreviewByUrl={linkPreviewByUrl}
            loading={commentsLoadingThreads.has(item.id)}
            loadingOlder={olderCommentsLoadingThreads.has(item.id)}
            canLoadOlder={commentsCanLoadOlderByThread[item.id] === true && (commentsByThread[item.id] || []).length < item.commentCount}
            commentPanelRef={commentPanelRef}
            commentRowNodeRefs={commentRowNodeRefs}
            onComposerLayout={() => firePendingCommentSnap(item.id, "composer", replyComposerRef)}
            onPanelLayout={() => firePendingCommentSnap(item.id, "panel", commentPanelRef)}
            replyComposerRef={replyComposerRef}
            replyComposerAnchorCommentId={replyComposerAnchorCommentId}
            replyDraft={replyDraft}
            replyFor={replyFor}
            replyMedia={replyMedia}
            replyInputRef={replyInputRef}
            replySubmitting={replySubmittingByThread.has(item.id)}
            replyTargetCommentId={replyTargetCommentId}
            thread={item}
            tree={tree}
            onLikeComment={(comment) => toggleCommentSupport(item, comment)}
            onMoreComment={(comment, event) => {
              setMoreCommentAnchor(getActionMenuAnchor(event));
              setMoreCommentTarget({ comment, thread: item });
            }}
            onOpenProfile={openVisibleProfile}
            onNavigate={onNavigate}
            onPickReplyMedia={pickReplyMedia}
            onReload={() => loadCommentsForThread(item)}
            onLoadOlder={() => loadOlderCommentsForThread(item)}
            onRemoveReplyMedia={(index) => setReplyMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            onReplyPress={(replyItem) => handleReplyPress(item, replyItem, tree)}
            onToggleReplyBranch={(replyItem) => toggleCommentBranch(item, replyItem, tree)}
            onSubmitReply={() => { void submitReply(item); }}
            onUpdateReplyDraft={setReplyDraft}
          />
        ) : null}
      </View>
    );
  }, [accessToken, clearReplyComposer, commentLoadErrors, commentsByThread, commentsCanLoadOlderByThread, commentsLoadingThreads, currentSessionKey, editingComment, expandedCommentBranches, expandedIds, expandedReplies, firePendingCommentSnap, handleReplyPress, hiddenCommentIds, highlightedThreadId, likedCommentIds, linkPreviewByUrl, loadCommentsForThread, loadOlderCommentsForThread, olderCommentsLoadingThreads, onNavigate, openThreadReplies, openVisibleProfile, pickReplyMedia, recordFeedEvent, replyComposerAnchorCommentId, replyDraft, replyFor, replyMedia, replySubmittingByThread, replyTargetCommentId, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, submitReply, supportedThreadIds, togglePinned, toggleSaved, toggleSupport, toggleCommentBranch, toggleCommentSupport, userId]);

  const handleViewableItemsChanged = useRef(({ changed }: { changed: ViewToken<NativeSocialThread>[] }) => {
    changed.forEach((entry) => {
      const threadId = entry.item?.id;
      if (!threadId) return;
      if (entry.isViewable) {
        if (!trackedImpressionsRef.current.has(threadId)) {
          trackedImpressionsRef.current.add(threadId);
          recordFeedEvent(threadId, "impression");
        }
        if (!trackedDwellRef.current.has(threadId) && !dwellTimeoutsRef.current.has(threadId)) {
          const timeoutId = setTimeout(() => {
            dwellTimeoutsRef.current.delete(threadId);
            if (trackedDwellRef.current.has(threadId)) return;
            trackedDwellRef.current.add(threadId);
            recordFeedEvent(threadId, "dwell_10s");
          }, 10000);
          dwellTimeoutsRef.current.set(threadId, timeoutId);
        }
      } else {
        const timeoutId = dwellTimeoutsRef.current.get(threadId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          dwellTimeoutsRef.current.delete(threadId);
        }
      }
    });
  }).current;

  const feedEmptyComponent = loading && threads.length === 0 ? <NativeSocialFeedSkeleton /> : <NativeSocialEmptyState />;

  const handleFeedScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawOffset = event.nativeEvent.contentOffset.y;
    const currentOffset = Math.max(0, rawOffset);
    const directionDelta = currentOffset - lastScrollOffsetRef.current;
    if (currentOffset <= 8) setSocialControlsHidden(false);
    else if (directionDelta > 5) setSocialControlsHidden(true);
    else if (directionDelta < -5) setSocialControlsHidden(false);
    if (rawOffset < 0 && !refreshing) setPullOffset(Math.min(Math.abs(rawOffset), 64));
    else if (pullOffset !== 0 && !refreshing) setPullOffset(0);

    const isScrollable = event.nativeEvent.contentSize.height > event.nativeEvent.layoutMeasurement.height + 8;
    if (!isScrollable) {
      if (composeFabRevealTimeoutRef.current) {
        clearTimeout(composeFabRevealTimeoutRef.current);
        composeFabRevealTimeoutRef.current = null;
      }
      setHideComposeFab(false);
      setNavMinimized(false);
      lastScrollOffsetRef.current = currentOffset;
      return;
    }
    const delta = Math.abs(currentOffset - lastScrollOffsetRef.current);
    const shouldHideForMotion = delta > 4;
    if (shouldHideForMotion) {
      if (composeFabRevealTimeoutRef.current) clearTimeout(composeFabRevealTimeoutRef.current);
      composeFabRevealTimeoutRef.current = setTimeout(() => {
        composeFabRevealTimeoutRef.current = null;
        setHideComposeFab(false);
      }, 150);
      setHideComposeFab(true);
    }
    applyNavMinimizeFromOffset(currentOffset, lastScrollOffsetRef.current);
    lastScrollOffsetRef.current = currentOffset;
  }, [pullOffset, refreshing]);

  // SO12: category tabs — single-select with a coupled content transition.
  // Ordered list mirrors the filter bar: index 0 = "All", then each SOCIAL_TAG.
  // Both tab taps and horizontal swipes route through selectCategory so the
  // animation, haptics and tab-strip indicator stay in sync.
  //
  // Motion: a two-phase directional handoff, not a hard cut. The outgoing feed
  // glides out and dissolves (110ms, ease-in), the data swap + scroll-to-top
  // happen while the layer is invisible (the only frame that could ever look
  // "choppy" is hidden), then the incoming feed glides in from the direction
  // of travel and settles on a spring while fading up (~240ms). Feels like
  // paging between physical surfaces rather than re-filtering a list.
  const feedSlideX = useRef(new Animated.Value(0)).current;
  const feedOpacity = useRef(new Animated.Value(1)).current;
  const feedTransitionRunningRef = useRef(false);
  // Monotonic id so an interrupted transition's completion callback can tell that it
  // has been superseded and must not commit its (now stale) category swap.
  const feedTransitionGenerationRef = useRef(0);

  const runFeedTransition = useCallback((direction: 1 | -1, swap: () => void) => {
    if (isReduceMotionActive()) {
      feedSlideX.setValue(0);
      feedOpacity.setValue(1);
      swap();
      return;
    }
    // Rapid re-taps: the newest transition owns the layer — never queue animations.
    //
    // stopAnimation() still invokes the interrupted animation's completion callback
    // (with finished:false), so without a generation guard a superseded transition
    // would run its swap() after the newer one had already started, committing the
    // category the user just moved away from. Only the current generation may swap.
    const generation = feedTransitionGenerationRef.current + 1;
    feedTransitionGenerationRef.current = generation;
    feedSlideX.stopAnimation();
    feedOpacity.stopAnimation();
    feedTransitionRunningRef.current = true;
    Animated.parallel([
      Animated.timing(feedSlideX, { toValue: direction * -32, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(feedOpacity, { toValue: 0, duration: 110, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      if (feedTransitionGenerationRef.current !== generation) return;
      swap();
      feedSlideX.setValue(direction * 44);
      Animated.parallel([
        Animated.spring(feedSlideX, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }),
        Animated.timing(feedOpacity, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        if (feedTransitionGenerationRef.current !== generation) return;
        feedTransitionRunningRef.current = false;
      });
    });
  }, [feedOpacity, feedSlideX]);

  // category: null = "All".
  //
  // The "already here" check reads categoryTargetRef, NOT selectedTags. selectedTags
  // only updates when the transition's swap lands ~110ms later, so comparing against
  // it dropped taps made during a transition: tap a topic then immediately tap All,
  // and selectedTags was still [] so this returned early and the All tap vanished.
  // The ref records intent synchronously, so every tap is honoured.
  const selectCategory = useCallback((category: string | null) => {
    const currentCategory = categoryTargetRef.current;
    if (currentCategory === category) return; // already here — no-op (and no transition)
    const currentIndex = currentCategory === null ? 0 : Math.max(0, SOCIAL_TAGS.indexOf(currentCategory) + 1);
    const nextIndex = category === null ? 0 : SOCIAL_TAGS.indexOf(category) + 1;
    categoryTargetRef.current = category;
    haptic.selectTab();
    releaseFocusedThread();
    runFeedTransition(nextIndex >= currentIndex ? 1 : -1, () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setSelectedTags(category === null ? [] : [category]);
      // Switching topic is a pure client-side filter over the already-loaded feed —
      // no network work is attached to the tap. Freshness comes from the entry load,
      // pull-to-refresh, and the realtime new-post bus. The bounded topic-coverage
      // effect still paginates in the background if a topic genuinely has no rows.
    });
  }, [releaseFocusedThread, runFeedTransition]);

  // Swipe left → next category (right neighbour); swipe right → previous.
  // At an edge, give a light boundary tap instead of switching.
  const goToAdjacentCategory = useCallback((direction: 1 | -1) => {
    const lastIndex = SOCIAL_TAGS.length; // "All" occupies index 0
    // Same reasoning as selectCategory: read intent, not the lagging rendered state.
    const currentTarget = categoryTargetRef.current;
    const currentIndex = currentTarget === null ? 0 : Math.max(0, SOCIAL_TAGS.indexOf(currentTarget) + 1);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex > lastIndex) {
      haptic.swipeReturn(); // rubber-band feedback at the ends
      return;
    }
    selectCategory(nextIndex === 0 ? null : SOCIAL_TAGS[nextIndex - 1]);
  }, [selectCategory]);

  // Keep the responder stable across renders while always calling the latest handler.
  const goToAdjacentCategoryRef = useRef(goToAdjacentCategory);
  useEffect(() => { goToAdjacentCategoryRef.current = goToAdjacentCategory; }, [goToAdjacentCategory]);

  const feedSwipeResponder = useMemo(() => {
    const HORIZONTAL_ACTIVATE = 24;
    const COMMIT_DISTANCE = 56;
    const VELOCITY_PROJECTION = 50;
    const shouldClaim = (dx: number, dy: number) => !carouselGestureActiveRef.current && Math.abs(dx) > HORIZONTAL_ACTIVATE && Math.abs(dx) > Math.abs(dy) * 1.6;
    return PanResponder.create({
      // Bubble phase lets protected child carousels keep the gesture first.
      onMoveShouldSetPanResponder: (_evt, gesture) => shouldClaim(gesture.dx, gesture.dy),
      onPanResponderRelease: (_evt, gesture) => {
        if (Math.abs(gesture.dx) <= Math.abs(gesture.dy)) return;
        const projected = gesture.dx + gesture.vx * VELOCITY_PROJECTION;
        if (Math.abs(projected) < COMMIT_DISTANCE) return;
        goToAdjacentCategoryRef.current(projected < 0 ? 1 : -1);
      },
    });
  }, []);

  const header = (
    <View>
      <NativeSocialFilterBar
        controlsHidden={socialControlsHidden}
        query={query}
        selectedTags={selectedTags}
        sortMode={sortMode}
        onClearTags={() => { selectCategory(null); }}
        onQueryChange={(value) => { releaseFocusedThread(); setQuery(value); }}
        onSortChange={setSortMode}
        onToggleTag={(tag) => { selectCategory(tag); }}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      {error && threads.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load("reset")} style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View
          ref={listViewportRef}
          style={styles.list}
          onLayout={(event) => {
            listHeightRef.current = event.nativeEvent.layout.height;
            const pending = pendingSnapRef.current;
            if (pending?.target === "composer") {
              const ref = replyComposerNodeRefs.current.get(`${pending.threadId}:composer`);
              if (ref?.current) firePendingCommentSnap(pending.threadId, "composer", ref);
            } else if (pending?.target === "panel") {
              const ref = commentPanelNodeRefs.current.get(pending.threadId);
              if (ref?.current) firePendingCommentSnap(pending.threadId, "panel", ref);
            }
          }}
        >
          {/* Tab strip lives OUTSIDE the animated layer AND outside the swipe
              responder below. It has its own horizontal ScrollView (scrolling
              to reveal "All" once you're several tabs to the right), and that
              scroll must never compete with the feed's topic-swipe gesture —
              putting feedSwipeResponder this high up used to make exactly that
              contest happen, which is what made "All" hard to reach once it had
              scrolled off-screen. */}
          {header}
          <Animated.View {...feedSwipeResponder.panHandlers} style={[styles.feedSlideLayer, { opacity: feedOpacity, transform: [{ translateX: feedSlideX }] }]}>
          <FlatList
            ref={listRef}
            alwaysBounceVertical
            bounces
            contentContainerStyle={styles.listContent}
            data={visibleThreads}
            extraData={{ expandedIds, highlightedThreadId, pinned: storedSets.pinned, pinnedAt: storedSets.pinnedAt, saved: storedSets.saved, supportedThreadIds }}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={feedEmptyComponent}
            ListFooterComponent={loadingMore ? <NativeLoadingState variant="inline" /> : null}
            onEndReached={() => {
              if (visibleThreads.length > 0 && hasMore) void load("more");
            }}
            onEndReachedThreshold={0.65}
            refreshControl={<RefreshControl enabled refreshing={refreshing} onRefresh={() => { haptic.selectTab(); void load("refresh"); }} tintColor={huddleColors.blue} colors={[huddleColors.blue]} progressViewOffset={huddleSocial.feedTopInset} />}
            onScroll={handleFeedScroll}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                animated: true,
                offset: Math.max(0, info.averageItemLength * info.index - Math.max(0, listHeightRef.current / 2)),
              });
            }}
            onViewableItemsChanged={handleViewableItemsChanged}
            renderItem={renderItem}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            viewabilityConfig={viewabilityConfigRef.current}
          />
          </Animated.View>
        </View>
      )}

      {hasNewPosts ? (
        <View pointerEvents="box-none" style={styles.newPostsPillWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show new posts"
            onPress={showNewPosts}
            style={({ pressed }) => [styles.newPostsPill, pressed ? styles.newPostsPillPressed : null]}
          >
            <Feather color={huddleColors.onPrimary} name="arrow-up" size={huddleType.label} />
            <Text style={styles.newPostsPillText}>New posts</Text>
          </Pressable>
        </View>
      ) : null}

      <Animated.View pointerEvents={hideComposeFab ? "none" : "auto"} style={[styles.composeFabWrap, { opacity: composeFabOpacityRef.current }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Compose post" onPress={() => { if (socialPostingBlocked) { haptic.warning(); openPostingRestriction(); } else { haptic.primaryConfirm(); setEditingThread(null); setComposerOpen(true); } }} style={({ pressed }) => [styles.composeFab, pressed ? styles.composeFabPressed : null]}>
          <Feather color={huddleColors.iconMuted} name="edit-3" size={huddleType.h3} />
        </Pressable>
      </Animated.View>
      {notice ? <NativeToast message={notice} /> : null}
      <NativeSocialComposerModal accessToken={accessToken} currentSessionKey={currentSessionKey} currentUserId={userId} editingThread={editingThread} isGoldUser={isGoldUser} linkPreviewByUrl={linkPreviewByUrl} onNavigate={onNavigate} open={composerOpen} onClose={closeComposer} onSubmit={submitComposer} />
      <NativeSocialMoreModal anchor={moreThreadAnchor} currentUserId={userId} open={Boolean(moreThread)} thread={moreThread} onBlock={confirmBlockThreadAuthor} onClose={() => { setMoreThread(null); setMoreThreadAnchor(null); }} onDelete={confirmDeleteThread} onEdit={(thread) => { setMoreThread(null); setMoreThreadAnchor(null); setEditingThread(thread); setComposerOpen(true); }} onHide={(thread) => { setHiddenThreadIds((current) => new Set([...current, thread.id])); recordFeedEvent(thread.id, "hide"); setMoreThread(null); setMoreThreadAnchor(null); }} onReport={(thread) => { setReportThread(thread); setMoreThread(null); setMoreThreadAnchor(null); }} />
      <NativeSocialShareModal accessToken={accessToken} currentUserId={userId} open={Boolean(shareThread)} thread={shareThread} onClose={() => setShareThread(null)} onNativeShare={openNativeShare} onNotice={showNotice} onShared={(threadId, count) => { recordFeedEvent(threadId, "share"); setThreads((current) => current.map((item) => item.id === threadId ? { ...item, shareCount: count ?? item.shareCount + 1 } : item)); }} />
      <NativeSocialReportModal accessToken={accessToken} currentUserId={userId} sessionKey={currentSessionKey} open={Boolean(reportThread)} subject={reportThread ? { type: "social_post", id: reportThread.id, label: "Social Post" } : null} target={reportThread} onClose={() => setReportThread(null)} onNotice={showNotice} onSubmitStart={() => {
        const targetId = reportThread?.id;
        if (!targetId) return;
        const previousHiddenThreadIds = hiddenThreadIds;
        socialReportRollbackRef.current = () => setHiddenThreadIds(previousHiddenThreadIds);
        setHiddenThreadIds((current) => new Set([...current, targetId]));
        markThreadRemoved(targetId);
        if (__DEV__) console.log("NATIVE_SOCIAL_POST_REPORT_OPTIMISTIC_START", { threadId: targetId });
      }} onSubmitFailure={() => {
        if (reportThread?.id) removedThreadIdsRef.current.delete(reportThread.id);
        socialReportRollbackRef.current?.();
        socialReportRollbackRef.current = null;
        if (__DEV__) console.warn("NATIVE_SOCIAL_POST_REPORT_OPTIMISTIC_ROLLBACK", { threadId: reportThread?.id || null });
      }} onSubmitSuccess={() => {
        socialReportRollbackRef.current = null;
        if (userId) void purgeNativeSocialPersistentCache(userId);
        if (reportThread) setThreads((current) => current.filter((thread) => thread.id !== reportThread.id));
      }} />
      <NativeSocialReportModal accessToken={accessToken} currentUserId={userId} sessionKey={currentSessionKey} open={Boolean(commentReportTarget)} subject={commentReportTarget ? { type: commentReportTarget.parentCommentId ? "social_reply" : "social_comment", id: commentReportTarget.id, label: commentReportTarget.parentCommentId ? "Social Reply" : "Social Comment" } : null} target={commentReportTarget ? { userId: commentReportTarget.userId, author: commentReportTarget.author } : null} onClose={() => setCommentReportTarget(null)} onNotice={showNotice} onSubmitStart={() => {
        const targetId = commentReportTarget?.id;
        if (!targetId) return;
        const previousHiddenCommentIds = hiddenCommentIds;
        socialReportRollbackRef.current = () => setHiddenCommentIds(previousHiddenCommentIds);
        setHiddenCommentIds((current) => new Set([...current, targetId]));
        if (commentReportTarget?.threadId) markCommentRemoved(commentReportTarget.threadId, targetId);
        if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_REPORT_OPTIMISTIC_START", { commentId: targetId });
      }} onSubmitFailure={() => {
        if (commentReportTarget?.threadId && commentReportTarget?.id) removedCommentIdsByThreadRef.current.get(commentReportTarget.threadId)?.delete(commentReportTarget.id);
        socialReportRollbackRef.current?.();
        socialReportRollbackRef.current = null;
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_REPORT_OPTIMISTIC_ROLLBACK", { commentId: commentReportTarget?.id || null });
      }} onSubmitSuccess={() => {
        socialReportRollbackRef.current = null;
        if (commentReportTarget?.threadId && commentReportTarget?.id) markCommentRemoved(commentReportTarget.threadId, commentReportTarget.id);
        if (userId) void purgeNativeSocialPersistentCache(userId);
      }} />
      <NativeSocialConfirmModal
        body="Delete this post permanently?"
        confirm="Delete"
        open={Boolean(deleteThreadTarget)}
        loading={Boolean(deletingThreadId)}
        title="Delete post?"
        onCancel={() => {
          if (deletingThreadId) return;
          setDeleteThreadTarget(null);
        }}
        onConfirm={executeDeleteThread}
      />
      <NativeSocialConfirmModal
        body="You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats."
        confirm="Block"
        open={Boolean(blockThreadTarget)}
        title={`Block ${blockThreadTarget?.author.displayName || "User"}?`}
        onCancel={() => setBlockThreadTarget(null)}
        onConfirm={executeBlockThreadAuthor}
      />
      <NativeSocialConfirmModal
        body="You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats."
        confirm="Block"
        open={Boolean(blockCommentTarget)}
        title={`Block ${blockCommentTarget?.author.displayName || "User"}?`}
        onCancel={() => setBlockCommentTarget(null)}
        onConfirm={executeBlockCommentAuthor}
      />
      <NativeSocialInfoModal
        body="Your ability to post or reply has been limited due to recent account activity that does not meet our community safety standards."
        open={socialRestrictionModalOpen}
        title="Posting access limited"
        onClose={() => setSocialRestrictionModalOpen(false)}
      />
      <NativeSocialCommentMoreModal
        anchor={moreCommentAnchor}
        currentUserId={userId}
        open={Boolean(moreCommentTarget)}
        target={moreCommentTarget}
        onClose={() => { setMoreCommentTarget(null); setMoreCommentAnchor(null); }}
        onDelete={(thread, comment) => {
          setMoreCommentTarget(null);
          setMoreCommentAnchor(null);
          deleteInlineComment(thread, comment);
        }}
        onEdit={(thread, comment) => {
          setMoreCommentTarget(null);
          setMoreCommentAnchor(null);
          setEditingComment({ comment, threadId: thread.id });
          setReplyFor(thread.id);
          setReplyTargetCommentId(comment.parentCommentId);
          setReplyComposerAnchorCommentId(comment.id);
          setReplyDraft(comment.content);
          setReplyMedia(hydrateEditReplyComposerMedia(comment));
        }}
        onHide={(comment) => {
          setHiddenCommentIds((current) => new Set([...current, comment.id]));
          setMoreCommentTarget(null);
          setMoreCommentAnchor(null);
        }}
        onBlock={(comment) => {
          setMoreCommentTarget(null);
          setMoreCommentAnchor(null);
          setTimeout(() => setBlockCommentTarget(comment), 0);
        }}
        onReport={(comment) => {
          setCommentReportTarget(comment);
          setMoreCommentTarget(null);
          setMoreCommentAnchor(null);
        }}
      />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        viewerUserId={userId}
        sessionKey={sessionKey}
        fallbackData={profileFallbackData}
        onClose={() => {
          setProfileUserId(null);
          setProfileFallbackData(null);
        }}
        onNavigate={onNavigate}
        open={Boolean(profileUserId)}
        profileUserId={profileUserId}
      />
    </View>
  );
}

function NativeSocialConfirmModal({
  body,
  confirm,
  loading,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  body: string;
  confirm: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  return <AppDestructiveSlideConfirm body={body} busy={Boolean(loading)} onClose={onCancel} onConfirm={onConfirm} open={open} slideLabel={`Slide to ${confirm}`} title={title} />;
}

function NativeSocialInfoModal({
  actionLabel,
  body,
  onAction,
  onClose,
  open,
  title,
}: {
  actionLabel?: string;
  body: string;
  onAction?: () => void;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!body) return null;
  return (
    <Modal presentationStyle="overFullScreen" animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <Pressable onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={(event) => event.stopPropagation()}>
        <AppModalCard>
          <AppModalScroll>
            <Text style={nativeModalStyles.appModalSheetTitle}>{title}</Text>
            <Text style={nativeModalStyles.appModalBody}>{body}</Text>
            <AppModalActionRow>
              <AppModalButton variant="secondary" onPress={onClose}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </AppModalButton>
              {actionLabel && onAction ? (
                <AppModalButton variant="primary" onPress={onAction}>
                  <Text style={styles.primaryButtonText}>{actionLabel}</Text>
                </AppModalButton>
              ) : null}
            </AppModalActionRow>
          </AppModalScroll>
        </AppModalCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NativeSocialMentionSuggestionList({
  onSelect,
  suggestions,
}: {
  onSelect: (suggestion: NativeSocialMentionSuggestion) => void;
  suggestions: NativeSocialMentionSuggestion[];
}) {
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.mentionSuggestionList}>
      {suggestions.map((suggestion) => (
        <Pressable
          accessibilityRole="button"
          key={suggestion.userId}
          onPress={() => onSelect(suggestion)}
          style={({ pressed }) => [styles.mentionSuggestionRow, pressed ? styles.pressed : null]}
        >
          <View style={styles.mentionSuggestionAvatar}>
            {suggestion.avatarUrl ? (
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(suggestion.avatarUrl, suggestion.avatarUrl)} source={{ uri: nativeFreshImageUri(suggestion.avatarUrl, suggestion.avatarUrl) }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} />
            ) : (
              <Text style={styles.mentionSuggestionInitial}>{(suggestion.socialId || "U").charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.mentionSuggestionBody}>
            <Text numberOfLines={1} style={styles.mentionSuggestionHandle}>@{suggestion.socialId}</Text>
            {suggestion.displayName ? <Text numberOfLines={1} style={styles.mentionSuggestionName}>{suggestion.displayName}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function NativeSocialInlineReplies({
  accessToken,
  canLoadOlder,
  commentPanelRef,
  commentRowNodeRefs,
  currentUserId,
  editingComment,
  error,
  likedCommentIds,
  linkPreviewByUrl,
  loading,
  loadingOlder,
  onComposerLayout,
  onLikeComment,
  onLoadOlder,
  onMoreComment,
  onNavigate,
  onOpenProfile,
  onPanelLayout,
  onPickReplyMedia,
  onReload,
  onRemoveReplyMedia,
  onReplyPress,
  onSubmitReply,
  onUpdateReplyDraft,
  replyComposerAnchorCommentId,
  replyDraft,
  replyFor,
  replyMedia,
  replyInputRef,
  replyComposerRef,
  replySubmitting,
  replyTargetCommentId,
  thread,
  tree,
  onToggleReplyBranch,
}: {
  accessToken?: string | null;
  canLoadOlder: boolean;
  commentPanelRef: RefObject<View | null>;
  commentRowNodeRefs: MutableRefObject<Map<string, RefObject<View | null>>>;
  currentUserId: string | null;
  editingComment: { comment: NativeSocialComment; threadId: string } | null;
  error?: string;
  likedCommentIds: Set<string>;
  linkPreviewByUrl: Record<string, NativeSocialLinkPreview>;
  loading: boolean;
  loadingOlder: boolean;
  onComposerLayout: () => void;
  replyComposerAnchorCommentId: string | null;
  replyDraft: string;
  replyFor: string | null;
  replyMedia: NativeSocialComposerMedia[];
  replyInputRef: RefObject<TextInput | null>;
  replyComposerRef: RefObject<View | null>;
  replySubmitting: boolean;
  replyTargetCommentId: string | null;
  thread: NativeSocialThread;
  tree: ReturnType<typeof buildNativeReplyTree>;
  onLikeComment: (comment: NativeSocialComment) => void;
  onLoadOlder: () => void;
  onMoreComment: (comment: NativeSocialComment, event: GestureResponderEvent) => void;
  onNavigate: (path: string) => void;
  onOpenProfile: (userId: string, author?: Partial<NativeSocialAuthor> | null) => void;
  onPanelLayout: () => void;
  onPickReplyMedia: () => void;
  onReload: () => void;
  onRemoveReplyMedia: (index: number) => void;
  onReplyPress: (item: NativeSocialThreadedReply) => void;
  onToggleReplyBranch: (item: NativeSocialThreadedReply) => void;
  onSubmitReply: () => void;
  onUpdateReplyDraft: (value: string) => void;
}) {
  const activeComposer = replyFor === thread.id;
  const [expandedCommentTextIds, setExpandedCommentTextIds] = useState<Set<string>>(new Set());
  const [truncatedCommentTextIds, setTruncatedCommentTextIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<NativeActiveMentionQuery | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<NativeSocialMentionSuggestion[]>([]);
  const replyPreviewUrl = extractCompletedComposerPreviewUrl(replyDraft);
  const displayedReplyDraft = replyPreviewUrl ? stripNativeSocialExternalUrlFromText(replyDraft, replyPreviewUrl) : replyDraft;
  const remainingReplyWords = MAX_COMPOSER_WORDS - countWords(replyDraft);
  const mentionUserIdByHandle = useMemo(() => {
    const next = new Map<string, string>();
    const add = (handle: string | null | undefined, id: string | null | undefined) => {
      const normalized = String(handle || "").trim().replace(/^@/, "").toLowerCase();
      if (normalized && id) next.set(normalized, id);
    };
    add(thread.author.socialId, thread.userId);
    add(thread.author.displayName, thread.userId);
    tree.threadedComments.forEach(({ comment }) => {
      add(comment.author.socialId, comment.userId);
      add(comment.author.displayName, comment.userId);
    });
    return next;
  }, [thread.author.displayName, thread.author.socialId, thread.userId, tree.threadedComments]);
  const activeReplyTarget = activeComposer && replyTargetCommentId
    ? tree.threadedComments.find((item) => item.comment.id === replyTargetCommentId) || null
    : null;
  const quotedReplyTarget = activeReplyTarget && activeReplyTarget.visualDepth >= 2 ? activeReplyTarget.comment : null;

  useEffect(() => {
    if (!activeComposer || mentionQuery == null) {
      setMentionSuggestions([]);
      return;
    }
    let active = true;
    void searchNativeSocialMentionSuggestions(mentionQuery.query, currentUserId, accessToken).then((results) => {
      if (active) setMentionSuggestions(results);
    });
    return () => { active = false; };
  }, [accessToken, activeComposer, currentUserId, mentionQuery]);

  const activeComposerIndex = replyComposerAnchorCommentId
    ? tree.threadedComments.findIndex((item) => item.comment.id === replyComposerAnchorCommentId)
    : -1;
  const shouldRenderComposerBeforeComment = (index: number) => activeComposer && replyComposerAnchorCommentId && activeComposerIndex >= 0 && index === activeComposerIndex + 1;
  const composerIndent = activeComposerIndex >= 0
    ? Math.min((tree.threadedComments[activeComposerIndex].visualDepth + 1) * huddleSocial.replyComposerIndentStep, huddleSocial.replyComposerMaxIndent)
    : 0;

  const renderComposer = (key: string, indent: number) => activeComposer ? (
    <View
      key={key}
      ref={replyComposerRef}
      onLayout={onComposerLayout}
      style={[styles.inlineReplyComposer, { marginLeft: indent + huddleSocial.replyComposerLeftInset, marginRight: huddleSocial.replyComposerOuterInset }]}
    >
      {replyTargetCommentId || editingComment ? (
        <Text numberOfLines={1} style={styles.replyTargetText}>
          {editingComment ? "Editing reply" : `Replying to ${(activeReplyTarget?.comment.author.socialId || activeReplyTarget?.comment.author.displayName || "User")}`}
        </Text>
      ) : null}
      <View style={styles.replyComposerField}>
        <View style={styles.replyComposerInputViewport}>
          <NativeSocialReplyComposerInput
            ref={replyInputRef}
            onBlur={() => setTimeout(() => setMentionQuery(null), 120)}
            onChangeText={(value) => {
              const nextValue = replyPreviewUrl ? `${value.trimEnd()} ${replyPreviewUrl} `.trimStart() : value;
              onUpdateReplyDraft(nextValue);
              setMentionQuery(findNativeActiveMentionQuery(nextValue, value.length));
            }}
            style={styles.replyComposerInput}
            onSelectionChange={(event) => setMentionQuery(findNativeActiveMentionQuery(replyDraft, event.nativeEvent.selection.start))}
            placeholder="Leave a comment"
            scrollEnabled
            value={displayedReplyDraft}
          />
        </View>
        {mentionQuery && mentionSuggestions.length > 0 ? (
          <NativeSocialMentionSuggestionList
            suggestions={mentionSuggestions}
            onSelect={(suggestion) => {
              onUpdateReplyDraft(insertNativeMention(replyDraft, mentionQuery, suggestion));
              setMentionQuery(null);
              setMentionSuggestions([]);
            }}
          />
        ) : null}
        {quotedReplyTarget ? <NativeSocialCompactReplyQuote comment={quotedReplyTarget} /> : null}
        {replyPreviewUrl ? (
          <NativeSocialExternalLinkPreview
            linkPreview={linkPreviewByUrl[replyPreviewUrl] || null}
            onOpen={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
            onRemove={() => {
              onUpdateReplyDraft(stripNativeSocialExternalUrlFromText(replyDraft, replyPreviewUrl));
              setMentionQuery(null);
            }}
            url={replyPreviewUrl}
          />
        ) : null}
        <View style={styles.replyComposerControls}>
          <Pressable accessibilityLabel="Add photo to reply" accessibilityRole="button" disabled={Boolean(editingComment)} onPress={onPickReplyMedia} style={({ pressed }) => [styles.replyComposerIconButton, editingComment ? styles.disabled : null, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.iconMuted} name="image" size={huddleSocial.actionIconSize} />
          </Pressable>
          {remainingReplyWords < 0 ? <Text style={styles.wordCounterError}>{remainingReplyWords}</Text> : null}
          <Pressable accessibilityLabel="Send reply" accessibilityRole="button" disabled={replySubmitting || !replyDraft.trim() || remainingReplyWords < 0} onPress={onSubmitReply} style={({ pressed }) => [styles.replySendButton, replySubmitting || !replyDraft.trim() || remainingReplyWords < 0 ? styles.replySendButtonDisabled : null, pressed ? styles.pressed : null]}>
            {replySubmitting ? <NativeSpinner tone="muted" /> : <Feather color={replySubmitting || !replyDraft.trim() || remainingReplyWords < 0 ? huddleColors.iconSubtle : huddleColors.onPrimary} name="arrow-up" size={huddleSocial.actionIconSize} />}
          </Pressable>
        </View>
      </View>
      {replyMedia.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.replyMediaRow}>
          {replyMedia.map((media, index) => (
            <View key={`${media.uri}-${index}`} style={[styles.mediaThumbWrap, { aspectRatio: composerMediaPreviewAspect(media) }]}>
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(media.uri, media.uri)} source={{ uri: nativeFreshImageUri(media.uri, media.uri) }} style={styles.mediaThumb as ImageStyle} transition={120} />
              <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => onRemoveReplyMedia(index)} style={styles.mediaRemoveButton}>
                <Feather color={huddleColors.onPrimary} name="x" size={14} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  ) : null;

  return (
    <View
      ref={commentPanelRef}
      onLayout={onPanelLayout}
      style={styles.inlineReplies}
    >
      {loading ? <NativeLoadingState variant="inline" /> : null}
      {!loading && error ? (
        <Pressable accessibilityRole="button" onPress={onReload} style={({ pressed }) => [styles.inlineReplyState, pressed ? styles.pressed : null]}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.commentActionText}>Retry</Text>
        </Pressable>
      ) : null}
      {!loading && !error && canLoadOlder ? (
        <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={onLoadOlder} style={({ pressed }) => [styles.inlineReplyState, pressed ? styles.pressed : null]}>
          {loadingOlder ? <NativeSpinner tone="accent" /> : <Text style={styles.commentActionText}>Load older replies</Text>}
        </Pressable>
      ) : null}
      {tree.threadedComments.map((item, index) => {
        const comment = item.comment;
        const canExpandBranch = item.depth < 2 && item.directChildCount > 0;
        const replyBadgeCount = item.depth === 0 ? item.directChildCount : item.depth === 1 ? item.descendantCount : 0;
        const branchExpanded = item.hasVisibleChildComments;
        const quotedParent = item.visualDepth === 2 && item.depth > 2 && comment.parentCommentId
          ? tree.threadedComments.find((entry) => entry.comment.id === comment.parentCommentId)?.comment || null
          : null;
        const commentPreviewUrl = extractNativeSocialFirstHttpUrl(comment.content);
        const indent = item.visualDepth * huddleSocial.replyRailColumnWidth;
        const railOffset = huddleSocial.replyRailOffset;
        return (
          <Fragment key={comment.id}>
            {shouldRenderComposerBeforeComment(index) ? renderComposer(`composer-${replyComposerAnchorCommentId}`, composerIndent) : null}
            <View
              ref={getViewNodeRef(commentRowNodeRefs, comment.id)}
              style={[styles.inlineCommentRow, indent > 0 ? { marginLeft: indent, width: "auto" } : null]}
            >
              {item.activeRailColumns.map((active, column) => active ? (
                <View
                  key={`${comment.id}-${column}`}
                  style={[
                    styles.replyRail,
                    {
                      bottom: column === item.parentRailColumn && item.isLastSibling && !item.hasVisibleChildComments ? undefined : -huddleSpacing.x2,
                      height: column === item.parentRailColumn && item.isLastSibling && !item.hasVisibleChildComments ? huddleSocial.replyRailLastSiblingHeight : undefined,
                      left: column * huddleSocial.replyRailColumnWidth + railOffset - indent,
                    },
                  ]}
                />
              ) : null)}
              {item.parentRailColumn !== null && !item.isMaxDepthContinuation ? <View style={[styles.replyRailDot, { left: item.parentRailColumn * huddleSocial.replyRailColumnWidth + railOffset - indent }]} /> : null}
              {item.hasVisibleChildComments && !item.activeRailColumns[item.childRailColumn] ? <View style={[styles.replyChildRail, { left: item.childRailColumn * huddleSocial.replyRailColumnWidth + railOffset - indent }]} /> : null}
              <Pressable accessibilityRole="button" onPress={() => onOpenProfile(comment.userId, comment.author)} style={styles.commentAvatar}>
                {comment.author.avatarUrl ? <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(comment.author.avatarUrl, comment.author.avatarUrl)} source={{ uri: nativeFreshImageUri(comment.author.avatarUrl, comment.author.avatarUrl) }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} /> : <Text style={styles.commentAvatarText}>{(comment.author.displayName || comment.author.socialId || "U").charAt(0).toUpperCase()}</Text>}
              </Pressable>
              <View style={styles.commentBody}>
                <View style={styles.commentHeader}>
                  <Text numberOfLines={1} onPress={() => onOpenProfile(comment.userId, comment.author)} style={styles.commentAuthor}>{comment.author.socialId || comment.author.displayName || "User"}</Text>
                  <Text style={styles.commentTime}>{compactTime(comment.createdAt)}</Text>
                </View>
                <Text
                  numberOfLines={expandedCommentTextIds.has(comment.id) ? undefined : huddleSocial.contentCollapsedLines}
                  onTextLayout={(event) => {
                    const isTruncated = event.nativeEvent.lines.length > huddleSocial.contentCollapsedLines;
                    setTruncatedCommentTextIds((current) => {
                      const next = new Set(current);
                      if (isTruncated) next.add(comment.id);
                      else next.delete(comment.id);
                      return next;
                    });
                  }}
                  style={styles.commentText}
                >
                  {renderNativeSocialCommentText(comment, onOpenProfile, commentPreviewUrl, mentionUserIdByHandle)}
                </Text>
                {truncatedCommentTextIds.has(comment.id) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExpandedCommentTextIds((current) => toggleSetValue(current, comment.id))}
                    style={({ pressed }) => [styles.commentSeeMoreButton, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.commentSeeMoreText}>{expandedCommentTextIds.has(comment.id) ? "See less" : "See more"}</Text>
                  </Pressable>
                ) : null}
                {quotedParent ? (
                  <NativeSocialCompactReplyQuote comment={quotedParent} />
                ) : null}
                {commentPreviewUrl ? (
                  <NativeSocialExternalLinkPreview
                    linkPreview={linkPreviewByUrl[commentPreviewUrl] || null}
                    onOpen={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
                    url={commentPreviewUrl}
                  />
                ) : null}
                {comment.images.length > 0 ? <NativeSocialCommentMediaCarousel comment={comment} /> : null}
                {comment.localStatus || isPendingSocialId(comment.id) ? (
                  <Text style={styles.commentStatusText}>Posting…</Text>
                ) : null}
                <View style={styles.commentIconActions}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: likedCommentIds.has(comment.id) }} hitSlop={huddleSpacing.x2} onPress={() => onLikeComment(comment)} style={({ pressed }) => [styles.commentIconButton, pressed ? styles.pressed : null]}>
                    <MaterialCommunityIcons
                      color={likedCommentIds.has(comment.id) ? huddleColors.coral : huddleColors.iconMuted}
                      name={likedCommentIds.has(comment.id) ? "paw" : "paw-outline"}
                      size={huddleSocial.actionIconSize}
                    />
                    {comment.supportCount > 0 ? <View style={styles.commentActionBadge}><Text style={styles.commentActionBadgeText}>{comment.supportCount}</Text></View> : null}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={canExpandBranch ? `${branchExpanded ? "Hide" : "View"} ${replyBadgeCount} ${replyBadgeCount === 1 ? "reply" : "replies"} and reply` : "Reply to comment"} hitSlop={huddleSpacing.x2} onPress={() => onReplyPress(item)} style={({ pressed }) => [styles.commentIconButton, pressed ? styles.pressed : null]}>
                    <Feather color={replyFor === thread.id && replyTargetCommentId === comment.id ? huddleColors.coral : huddleColors.iconMuted} name="message-circle" size={huddleSocial.actionIconSize} />
                    {canExpandBranch ? <View style={styles.commentActionBadge}><Text style={styles.commentActionBadgeText}>{replyBadgeCount}</Text></View> : null}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="More reply actions" hitSlop={huddleSpacing.x2} onPress={(event) => onMoreComment(comment, event)} style={({ pressed }) => [styles.commentIconButton, pressed ? styles.pressed : null]}>
                    <Feather color={huddleColors.iconMuted} name="more-horizontal" size={huddleSocial.actionIconSize} />
                  </Pressable>
                </View>
              </View>
            </View>
          </Fragment>
        );
      })}
      {activeComposer && !replyComposerAnchorCommentId ? renderComposer("composer-root", 0) : null}
      {activeComposer && replyComposerAnchorCommentId && activeComposerIndex === tree.threadedComments.length - 1 ? renderComposer(`composer-${replyComposerAnchorCommentId}`, composerIndent) : null}
    </View>
  );
}

function NativeSocialComposerModal({
  accessToken,
  currentSessionKey,
  currentUserId,
  editingThread,
  isGoldUser,
  linkPreviewByUrl,
  onClose,
  onNavigate,
  onSubmit,
  open,
}: {
  accessToken?: string | null;
  currentSessionKey: string;
  currentUserId: string | null;
  editingThread: NativeSocialThread | null;
  isGoldUser: boolean;
  linkPreviewByUrl: Record<string, NativeSocialLinkPreview>;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSubmit: (payload: { category: string; content: string; isSensitive: boolean; media: NativeSocialComposerUploadMedia[]; title: string }) => Promise<void>;
  open: boolean;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Social");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [media, setMedia] = useState<NativeSocialComposerUploadMedia[]>([]);
  const [focusedField, setFocusedField] = useState<"category" | "title" | "content" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Composer submit shake — fires when user attempts to slide without title or content
  const { shake: triggerComposerShake, shakeStyle: composerShakeStyle } = useErrorShake();
  // Composer field validation — broadcast pattern: slide always enabled; on commit failure, mark fields red + scroll + reset slider
  const [composerValidationErrors, setComposerValidationErrors] = useState<{ title?: boolean; content?: boolean }>({});
  const [composerSliderResetKey, setComposerSliderResetKey] = useState(0);
  const contentInputRef = useRef<TextInput | null>(null);
  const composerScrollRef = useRef<ScrollView | null>(null);
  const composerFieldOffsetsRef = useRef<Record<"category" | "title" | "content", number>>({ category: 0, title: 0, content: 0 });
  const lastFocusedComposerFieldRef = useRef<"category" | "title" | "content" | null>(null);
  const [mentionQuery, setMentionQuery] = useState<NativeActiveMentionQuery | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<NativeSocialMentionSuggestion[]>([]);
  const [contentFocused, setContentFocused] = useState(false);
  const [contentScrollY, setContentScrollY] = useState(0);
  const [mediaNotice, setMediaNotice] = useState("");
  const wordsUsed = countWords(content);
  const contentPreviewUrl = extractCompletedComposerPreviewUrl(content);
  const displayedContent = contentPreviewUrl ? stripNativeSocialExternalUrlFromText(content, contentPreviewUrl) : content;
  const [composerPreviewByUrl, setComposerPreviewByUrl] = useState<Record<string, NativeSocialLinkPreview>>({});
  const uploadProgress = useMemo(() => {
    return averageNativeUploadProgress(media, (item) => item.kind === "image");
  }, [media]);

  useEffect(() => {
    if (!open) return;
    setTitle(editingThread?.title || "");
    setContent(editingThread?.content || "");
    setCategory(editingThread?.tags[0] || "Social");
    setCategoryOpen(false);
    setIsSensitive(editingThread?.isSensitive === true);
    setMedia(hydrateEditComposerMedia(editingThread));
    setFocusedField(null);
    setMentionQuery(null);
    setMentionSuggestions([]);
    setContentFocused(false);
    setMediaNotice("");
    lastFocusedComposerFieldRef.current = null;
    submittingRef.current = false;
    setSubmitting(false);
  }, [editingThread, open]);

  useEffect(() => {
    if (open) return;
    setTitle("");
    setContent("");
    setCategory("Social");
    setCategoryOpen(false);
    setIsSensitive(false);
    setMedia([]);
    setFocusedField(null);
    setSubmitting(false);
    setMentionQuery(null);
    setMentionSuggestions([]);
    setContentFocused(false);
    setMediaNotice("");
    lastFocusedComposerFieldRef.current = null;
    submittingRef.current = false;
  }, [open]);

  const scrollComposerFieldIntoView = useCallback((field: "category" | "title" | "content") => {
    lastFocusedComposerFieldRef.current = field;
    const scroll = () => {
      composerScrollRef.current?.scrollTo({
        y: Math.max(0, (composerFieldOffsetsRef.current[field] || 0) - huddleSpacing.x2),
        animated: true,
      });
    };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);

  const toggleCategoryMenu = useCallback(() => {
    setCategoryOpen((current) => !current);
  }, []);

  const isNewUploadedComposerImage = useCallback((item: NativeSocialComposerUploadMedia) => (
    item.kind === "image" &&
    typeof item.uploadedUrl === "string" &&
    item.uploadedUrl.trim().length > 0 &&
    !(editingThread?.images || []).includes(item.uploadedUrl.trim())
  ), [editingThread?.images]);

  const cleanupComposerUploads = useCallback((items: NativeSocialComposerUploadMedia[], reason: string) => {
    if (!currentUserId) return;
    const urls = items.filter(isNewUploadedComposerImage).map((item) => item.uploadedUrl!.trim());
    if (urls.length === 0) return;
    void cleanupNativeSocialStorageImages(urls, currentUserId, accessToken, reason, currentSessionKey).catch(() => undefined);
  }, [accessToken, currentSessionKey, currentUserId, isNewUploadedComposerImage]);

  const closeComposerWithCleanup = useCallback(() => {
    cleanupComposerUploads(media, "social_thread_composer_cancelled_upload");
    onClose();
  }, [cleanupComposerUploads, media, onClose]);

  const removeComposerMedia = useCallback((index: number) => {
    setMedia((current) => {
      const target = current[index];
      if (target) cleanupComposerUploads([target], "social_thread_composer_removed_media");
      return current.filter((_, idx) => idx !== index);
    });
  }, [cleanupComposerUploads]);

  useEffect(() => {
    if (media.length > 0) return;
    setIsSensitive(false);
  }, [media.length]);

  useEffect(() => {
    if (!open || mentionQuery == null) {
      setMentionSuggestions([]);
      return;
    }
    let active = true;
    void searchNativeSocialMentionSuggestions(mentionQuery.query, currentUserId, accessToken).then((results) => {
      if (active) setMentionSuggestions(results);
    });
    return () => { active = false; };
  }, [accessToken, currentUserId, mentionQuery, open]);

  useEffect(() => {
    if (!open || !contentPreviewUrl || linkPreviewByUrl[contentPreviewUrl] || composerPreviewByUrl[contentPreviewUrl]) return;
    let active = true;
    setComposerPreviewByUrl((current) => ({
      ...current,
      [contentPreviewUrl]: { url: contentPreviewUrl, loading: true, failed: false, resolved: false },
    }));
    void fetchNativeSocialLinkPreviews([contentPreviewUrl], accessToken).then((previews) => {
      if (!active) return;
      setComposerPreviewByUrl((current) => ({ ...current, ...previews }));
    });
    return () => { active = false; };
  }, [accessToken, composerPreviewByUrl, contentPreviewUrl, linkPreviewByUrl, open]);

  const pickMedia = useCallback(async () => {
    if (!currentUserId) return;
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: editingThread?.providerVideoId ? ["images"] : ["images", "videos"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: Math.max(1, MAX_COMPOSER_MEDIA - media.length),
      });
    } catch (error) {
      setMediaNotice(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
    if (result.canceled) return;
    const hasExistingVideo = media.some((item) => item.kind === "video");
    const accepted: NativeSocialComposerUploadMedia[] = [];
    let skippedVideoNeedsGold = false;
    let skippedVideoDuplicate = false;
    let skippedVideoTooLarge = false;
    for (const asset of result.assets) {
      const item = {
        durationSeconds: typeof asset.duration === "number" ? asset.duration / 1000 : null,
        height: asset.height,
        kind: asset.type === "video" ? "video" as const : "image" as const,
        mimeType: asset.mimeType,
        name: asset.fileName,
        size: asset.fileSize,
        uri: asset.uri,
        width: asset.width,
      };
      if (item.kind === "video" && !isGoldUser) {
        skippedVideoNeedsGold = true;
        continue;
      }
      if (item.kind === "video" && (hasExistingVideo || accepted.some((next) => next.kind === "video"))) {
        skippedVideoDuplicate = true;
        continue;
      }
      if (item.kind === "video" && typeof item.size === "number" && item.size > NATIVE_SOCIAL_VIDEO_MAX_BYTES) {
        skippedVideoTooLarge = true;
        continue;
      }
      accepted.push({ ...item, progress: item.kind === "image" ? 0 : 100, status: item.kind === "image" ? "queued" : "uploaded", uploadedUrl: null });
    }
    setMediaNotice(
      skippedVideoNeedsGold ? "Video upload is available for huddle＊ members only." :
      skippedVideoTooLarge ? "Choose a 15 seconds or shorter video." :
      skippedVideoDuplicate ? "Only one video can be added to a post." :
      accepted.length === 0 ? "No media was added." : ""
    );
    setMedia((current) => [...current, ...accepted].slice(0, MAX_COMPOSER_MEDIA));
    if (lastFocusedComposerFieldRef.current) {
      setTimeout(() => scrollComposerFieldIntoView(lastFocusedComposerFieldRef.current as "category" | "title" | "content"), 220);
    }
    const uploadItems = accepted.filter((item) => item.kind === "image");
    const uploadOne = async (item: NativeSocialComposerUploadMedia) => {
      setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: Math.max(entry.progress ?? 0, NATIVE_UPLOAD_PROGRESS_START), status: "uploading", error: null } : entry));
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      try {
        progressTimer = setInterval(() => {
          setMedia((current) => current.map((entry) => (
            entry.uri === item.uri && entry.status === "uploading"
              ? { ...entry, progress: nextNativeUploadProgress(entry.progress ?? NATIVE_UPLOAD_PROGRESS_START) }
              : entry
          )));
        }, 450);
        const uploadedUrl = await uploadNativeSocialImage(currentUserId, item, "thread", accessToken, currentSessionKey);
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 100, status: "uploaded", uploadedUrl, error: null } : entry));
      } catch (error) {
        logNativeProtectedActionFailure("[native.social] upload_media_failed", error);
        const message = nativeSafeErrorCopy(error, "Couldn't upload that image. Remove it or try again.");
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 0, status: "error", uploadedUrl: null, error: message } : entry));
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }
    };
    const uploadQueue = async () => {
      const queue = [...uploadItems];
      await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) await uploadOne(next);
        }
      }));
    };
    requestAnimationFrame(() => {
      void uploadQueue();
    });
  }, [accessToken, currentSessionKey, currentUserId, editingThread, isGoldUser, media, scrollComposerFieldIntoView]);

  const submit = useCallback(() => {
    if (submittingRef.current || submitting) return;
    if (media.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "error")) return;
    // Broadcast-style validation: slide is always enabled. On commit, validate; if invalid, mark fields red + scroll to first missing + reset slider + shake.
    const nextErrors = { title: !title.trim(), content: !content.trim() };
    setComposerValidationErrors(nextErrors);
    if (nextErrors.title || nextErrors.content) {
      triggerComposerShake();
      setComposerSliderResetKey((current) => current + 1);
      if (nextErrors.title) scrollComposerFieldIntoView("title");
      else scrollComposerFieldIntoView("content");
      return;
    }
    haptic.success();
    submittingRef.current = true;
    setSubmitting(true);
    void onSubmit({ category, content, isSensitive: media.length > 0 ? isSensitive : false, media, title }).finally(() => {
      submittingRef.current = false;
      setSubmitting(false);
    });
  }, [category, content, isSensitive, media, onSubmit, scrollComposerFieldIntoView, submitting, title, triggerComposerShake]);

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={closeComposerWithCleanup} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close composer" accessibilityRole="button" onPress={closeComposerWithCleanup} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="autoMax" onClose={closeComposerWithCleanup}>
          <AppBottomSheetHeader>
            <Text style={styles.sheetTitle}>{editingThread ? "Edit post" : "Create post"}</Text>
            <AppModalCloseButton onPress={closeComposerWithCleanup} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll fill scrollRef={composerScrollRef}>
            <View style={styles.composerFieldStack}>
            <View
              onLayout={(event) => {
                composerFieldOffsetsRef.current.category = event.nativeEvent.layout.y;
              }}
              style={styles.categorySelectBlock}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select category"
                onPress={() => {
                  setFocusedField("category");
                  scrollComposerFieldIntoView("category");
                  toggleCategoryMenu();
                }}
                style={({ pressed }) => [styles.categorySelectField, focusedField === "category" || categoryOpen ? styles.categorySelectFieldFocused : null, pressed ? styles.pressed : null]}
              >
                <Text style={styles.categorySelectText}>{category}</Text>
                <Feather color={huddleColors.iconMuted} name={categoryOpen ? "chevron-up" : "chevron-down"} size={20} />
              </Pressable>
              {categoryOpen ? (
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={styles.categorySelectMenuInline}
                  contentContainerStyle={styles.categorySelectMenuContent}
                >
                  {SOCIAL_TAGS.map((tag) => (
                    <Pressable
                      key={tag}
                      accessibilityRole="button"
                      accessibilityState={{ selected: category === tag }}
                      onPress={() => {
                        setCategory(tag);
                        setCategoryOpen(false);
                      }}
                      style={({ pressed }) => [styles.categorySelectOption, category === tag ? styles.categorySelectOptionActive : null, pressed ? styles.pressed : null]}
                    >
                      <Text style={[styles.categorySelectOptionText, category === tag ? styles.categorySelectOptionTextActive : null]}>{tag}</Text>
                      {category === tag ? <Feather color={huddleColors.blue} name="check" size={14} /> : <View style={styles.categorySelectCheckSlot} />}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
            <View
              onLayout={(event) => {
                composerFieldOffsetsRef.current.title = event.nativeEvent.layout.y;
              }}
              style={[styles.composerPlainField, focusedField === "title" ? styles.composerPlainFieldFocused : null, composerValidationErrors.title ? styles.composerPlainFieldError : null]}
            >
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                maxLength={140}
                onChangeText={(value) => { setTitle(value); if (composerValidationErrors.title && value.trim()) setComposerValidationErrors((current) => ({ ...current, title: false })); }}
                onBlur={() => setFocusedField(null)}
                onFocus={() => {
                  setCategoryOpen(false);
                  setFocusedField("title");
                  scrollComposerFieldIntoView("title");
                }}
                onSubmitEditing={() => contentInputRef.current?.focus()}
                placeholder="What is happening?"
                placeholderTextColor={huddleColors.mutedText}
                returnKeyType="next"
                style={styles.composerPlainInput}
                value={title}
              />
            </View>
            <View
              onLayout={(event) => {
                composerFieldOffsetsRef.current.content = event.nativeEvent.layout.y;
              }}
              style={[styles.composerPlainField, styles.composerPlainTextArea, contentFocused ? styles.composerPlainFieldFocused : null, composerValidationErrors.content ? styles.composerPlainFieldError : null]}
            >
              <View style={styles.composerMentionField}>
                <Text style={[styles.composerMentionTextLayer, { transform: [{ translateY: -contentScrollY }] }]}>
                  {displayedContent ? renderReplyComposerLayer(displayedContent) : <Text style={styles.composerMentionPlaceholder}>Share details</Text>}
                </Text>
                <TextInput
                  ref={contentInputRef}
                  multiline
                  onBlur={() => {
                    setFocusedField(null);
                    setContentFocused(false);
                    setTimeout(() => setMentionQuery(null), 120);
                  }}
                  onChangeText={(value) => {
                    const nextValue = contentPreviewUrl ? `${value.trimEnd()} ${contentPreviewUrl} `.trimStart() : value;
                    setContent(nextValue);
                    if (composerValidationErrors.content && nextValue.trim()) setComposerValidationErrors((current) => ({ ...current, content: false }));
                    setMentionQuery(findNativeActiveMentionQuery(nextValue, value.length));
                  }}
                  onFocus={() => {
                    setCategoryOpen(false);
                    setFocusedField("content");
                    setContentFocused(true);
                    scrollComposerFieldIntoView("content");
                  }}
                  onSelectionChange={(event) => setMentionQuery(findNativeActiveMentionQuery(content, event.nativeEvent.selection.start))}
                  onScroll={(event) => setContentScrollY(event.nativeEvent.contentOffset.y)}
                  placeholder="Share details"
                  placeholderTextColor="transparent"
                  scrollEnabled
                  style={styles.composerMentionInput}
                  textAlignVertical="top"
                  value={displayedContent}
                />
              </View>
            </View>
            </View>
            {wordsUsed > MAX_COMPOSER_WORDS ? <Text style={styles.wordCounterError}>{wordsUsed - MAX_COMPOSER_WORDS}</Text> : null}
            {mentionQuery && mentionSuggestions.length > 0 ? (
              <NativeSocialMentionSuggestionList
                suggestions={mentionSuggestions}
                onSelect={(suggestion) => {
                  setContent((current) => insertNativeMention(current, mentionQuery, suggestion));
                  setMentionQuery(null);
                  setMentionSuggestions([]);
                }}
              />
            ) : null}
            {contentPreviewUrl ? (
              <NativeSocialExternalLinkPreview
                linkPreview={linkPreviewByUrl[contentPreviewUrl] || composerPreviewByUrl[contentPreviewUrl] || null}
                onOpen={(url) => { if (!navigateNativeHuddleLink(url, onNavigate)) void Linking.openURL(url); }}
                onRemove={() => {
                  setContent((current) => stripNativeSocialExternalUrlFromText(current, contentPreviewUrl));
                  setMentionQuery(null);
                }}
                url={contentPreviewUrl}
              />
            ) : null}
            <View style={styles.mediaPickerBlock}>
              {media.length > 0 ? (
                <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.mediaRailViewport} contentContainerStyle={styles.mediaThumbRow}>
                  {media.map((item, index) => (
                    <View key={`${item.uri}-${index}`} style={[styles.mediaThumbWrap, { aspectRatio: composerMediaPreviewAspect(item) }]}>
                  {item.kind === "image" ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(item.uri, item.uri)} source={{ uri: nativeFreshImageUri(item.uri, item.uri) }} style={styles.mediaThumb} transition={120} /> : <View style={styles.videoThumb}><Feather color={huddleColors.onPrimary} name="play" size={22} /></View>}
                      {item.status === "uploading" && uploadProgress !== null && item.kind === "image" ? (
                        <View pointerEvents="none" style={styles.mediaUploadingOverlay}>
                          <NativeSpinner tone="primary" />
                          <Text style={styles.mediaUploadingText}>Uploading {uploadProgress}%</Text>
                        </View>
                      ) : null}
                      <Pressable accessibilityLabel="Remove media" accessibilityRole="button" onPress={() => removeComposerMedia(index)} style={styles.mediaRemoveButton}><Feather color={huddleColors.onPrimary} name="x" size={14} /></Pressable>
                    </View>
                  ))}
                </ScrollView>
	              ) : null}
              {mediaNotice ? (
                <View style={styles.mediaNoticeRow}>
                  <Feather color={huddleColors.blue} name="info" size={14} />
                  <Text style={styles.mediaNoticeText}>{mediaNotice}</Text>
                </View>
              ) : null}
            </View>
            {media.length > 0 ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSensitive }} onPress={() => setIsSensitive((current) => !current)} style={({ pressed }) => [styles.checkboxRow, pressed ? styles.pressed : null]}>
                <View style={[styles.checkboxBox, isSensitive ? styles.checkboxBoxActive : null]}>{isSensitive ? <Feather color={huddleColors.onPrimary} name="check" size={12} /> : null}</View>
                <Text style={styles.checkboxText}>This photo contains injury, blood, sensitive or disturbing content</Text>
              </Pressable>
            ) : null}
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <View style={styles.composerFooterRow}>
              <Pressable accessibilityLabel={isGoldUser ? "Add media" : "Add images"} accessibilityRole="button" disabled={!currentUserId} onPress={pickMedia} style={({ pressed }) => [styles.footerImageButton, !currentUserId ? styles.disabled : null, pressed ? styles.pressed : null]}>
                <Feather color={huddleColors.blue} name="camera" size={huddleSocial.actionIconSize} />
              </Pressable>
              <Animated.View style={[{ flex: 1 }, composerShakeStyle]}>
                <SlideToConfirm
                  busy={submitting}
                  disabled={media.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "error")}
                  label={editingThread ? "Slide to Save" : "Slide to Post"}
                  onCommit={submit}
                  resetKey={composerSliderResetKey}
                />
              </Animated.View>
            </View>
          </AppBottomSheetFooter>
          </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NativeSocialCommentMoreModal({
  anchor,
  currentUserId,
  onClose,
  onBlock,
  onDelete,
  onEdit,
  onHide,
  onReport,
  open,
  target,
}: {
  anchor: NativeActionMenuAnchor;
  currentUserId: string | null;
  onClose: () => void;
  onBlock: (comment: NativeSocialComment) => void;
  onDelete: (thread: NativeSocialThread, comment: NativeSocialComment) => void;
  onEdit: (thread: NativeSocialThread, comment: NativeSocialComment) => void;
  onHide: (comment: NativeSocialComment) => void;
  onReport: (comment: NativeSocialComment) => void;
  open: boolean;
  target: { comment: NativeSocialComment; thread: NativeSocialThread } | null;
}) {
  if (!target) return null;
  const owned = Boolean(currentUserId && target.comment.userId === currentUserId);
  const threadOwned = Boolean(currentUserId && target.thread.userId === currentUserId);
  const windowSize = Dimensions.get("window");
  const menuWidth = owned ? 176 : 190;
  const menuHeight = owned ? 88 : threadOwned ? 176 : 132;
  const menuLeft = anchor ? Math.max(huddleSpacing.x3, Math.min(windowSize.width - menuWidth - huddleSpacing.x3, anchor.x - menuWidth + huddleSpacing.x4)) : windowSize.width - menuWidth - huddleSpacing.x5;
  const menuTop = anchor ? Math.max(huddleSpacing.x5, Math.min(windowSize.height - menuHeight - huddleSpacing.x5, anchor.y + huddleSpacing.x2)) : windowSize.height - menuHeight - huddleSpacing.x9;
  return (
    <Modal presentationStyle="overFullScreen" animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.moreMenuBackdrop}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppActionMenu style={{ left: menuLeft, position: "absolute", top: menuTop, width: menuWidth }} items={[
          ...(owned ? [{ label: "Edit", icon: "edit-3" as const, onPress: () => onEdit(target.thread, target.comment) }] : []),
          ...(owned ? [{ label: "Delete", icon: "trash-2" as const, onPress: () => onDelete(target.thread, target.comment), destructive: true }] : []),
          ...(!owned ? [{ label: "Report", icon: "flag" as const, onPress: () => onReport(target.comment) }] : []),
          ...(!owned && threadOwned ? [{ label: "Hide", icon: "eye-off" as const, onPress: () => onHide(target.comment) }] : []),
          ...(!owned ? [{ label: "Block user", icon: "slash" as const, onPress: () => onBlock(target.comment), destructive: true }] : []),
        ]} />
      </View>
    </Modal>
  );
}

function NativeSocialMoreModal({
  anchor,
  currentUserId,
  onBlock,
  onClose,
  onDelete,
  onEdit,
  onHide,
  onReport,
  open,
  thread,
}: {
  anchor: NativeActionMenuAnchor;
  currentUserId: string | null;
  onBlock: (thread: NativeSocialThread) => void;
  onClose: () => void;
  onDelete: (thread: NativeSocialThread) => void;
  onEdit: (thread: NativeSocialThread) => void;
  onHide: (thread: NativeSocialThread) => void;
  onReport: (thread: NativeSocialThread) => void;
  open: boolean;
  thread: NativeSocialThread | null;
}) {
  if (!thread) return null;
  const owned = Boolean(currentUserId && thread.userId === currentUserId);
  const windowSize = Dimensions.get("window");
  const menuWidth = owned ? 176 : 190;
  const menuHeight = owned ? 88 : 132;
  const menuLeft = anchor ? Math.max(huddleSpacing.x3, Math.min(windowSize.width - menuWidth - huddleSpacing.x3, anchor.x - menuWidth + huddleSpacing.x4)) : windowSize.width - menuWidth - huddleSpacing.x5;
  const menuTop = anchor ? Math.max(huddleSpacing.x5, Math.min(windowSize.height - menuHeight - huddleSpacing.x5, anchor.y + huddleSpacing.x2)) : windowSize.height - menuHeight - huddleSpacing.x9;
  return (
    <Modal presentationStyle="overFullScreen" animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.moreMenuBackdrop}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppActionMenu style={{ left: menuLeft, position: "absolute", top: menuTop, width: menuWidth }} items={[
          ...(owned ? [{ label: "Edit", icon: "edit-3" as const, onPress: () => onEdit(thread) }] : []),
          ...(owned ? [{ label: "Delete", icon: "trash-2" as const, onPress: () => onDelete(thread), destructive: true }] : []),
          ...(!owned ? [{ label: "Report", icon: "flag" as const, onPress: () => onReport(thread) }] : []),
          ...(!owned ? [{ label: "Hide", icon: "eye-off" as const, onPress: () => onHide(thread) }] : []),
          ...(!owned ? [{ label: "Block user", icon: "slash" as const, onPress: () => onBlock(thread), destructive: true }] : []),
        ]} />
      </View>
    </Modal>
  );
}

function NativeSocialShareModal({
  accessToken,
  currentUserId,
  onClose,
  onNativeShare,
  onNotice,
  onShared,
  open,
  thread,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  onClose: () => void;
  onNativeShare: (thread: NativeSocialThread) => Promise<void>;
  onNotice: (message: string) => void;
  onShared: (threadId: string, count: number | null) => void;
  open: boolean;
  thread: NativeSocialThread | null;
}) {
  const [targets, setTargets] = useState<NativeSocialShareTarget[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [failedTargetAvatars, setFailedTargetAvatars] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!open || !currentUserId) {
      setTargets([]);
      setSelectedKeys(new Set());
      return;
    }
    setLoading(true);
    setSearchQuery("");
    setSelectedKeys(new Set());
    setFailedTargetAvatars(new Set());
    void fetchNativeSocialShareTargets(currentUserId, accessToken)
      .then(setTargets)
      .catch(() => onNotice("Unable to load chats right now."))
      .finally(() => setLoading(false));
  }, [accessToken, currentUserId, onNotice, open]);

  const selectedTargets = useMemo(
    () => targets.filter((target) => selectedKeys.has(target.chatId)),
    [selectedKeys, targets],
  );
  const filteredTargets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target) => `${target.label} ${target.subtitle || ""}`.toLowerCase().includes(q));
  }, [searchQuery, targets]);
  const shareToChat = useCallback(() => {
    if (!thread || !currentUserId || selectedTargets.length === 0 || sending) return;
    setSending(true);
    void Promise.allSettled(selectedTargets.map((target) => (
      sendNativeSocialShareToChat(thread, target, currentUserId, accessToken)
    )))
      .then(async (results) => {
        const sharedCount = results.filter((result) => result.status === "fulfilled").length;
        const failedCount = results.length - sharedCount;
        if (sharedCount === 0) throw new Error("share_failed");
        const count = await recordNativeSocialShare(thread.id, accessToken);
        onShared(thread.id, count);
        onNotice(failedCount > 0
          ? `Shared in ${sharedCount} chat${sharedCount === 1 ? "" : "s"}. ${failedCount} couldn't be sent.`
          : `Shared in ${sharedCount} chat${sharedCount === 1 ? "" : "s"}.`);
        onClose();
      })
      .catch(() => onNotice("Unable to share in chat right now."))
      .finally(() => setSending(false));
  }, [accessToken, currentUserId, onClose, onNotice, onShared, selectedTargets, sending, thread]);

  if (!thread) return null;
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={styles.sheetTitle}>Share</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <View style={styles.shareSheetContent}>
            <View style={styles.shareSearchField}>
              <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                accessibilityLabel="Search share targets"
                autoCorrect={false}
                onChangeText={setSearchQuery}
                placeholder="Search name or Social ID"
                placeholderTextColor={huddleColors.mutedText}
                style={styles.shareSearchInput}
                value={searchQuery}
              />
            </View>
            <View style={styles.shareTargetsBlock}>
              {loading ? <NativeLoadingState variant="inline" /> : filteredTargets.length === 0 ? <Text style={styles.emptyCommentText}>No chats found.</Text> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shareTargetRow}>
                  {filteredTargets.map((target) => {
                    const selected = selectedKeys.has(target.chatId);
                    return (
                      <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedKeys((current) => {
                        const next = new Set(current);
                        if (next.has(target.chatId)) next.delete(target.chatId);
                        else next.add(target.chatId);
                        return next;
                      })} style={({ pressed }) => [styles.shareTarget, pressed ? styles.pressed : null]}>
                        <View style={[styles.shareTargetAvatar, selected ? styles.shareTargetAvatarSelected : null]}>
                          {target.avatarUrl && !failedTargetAvatars.has(target.avatarUrl) ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(target.avatarUrl, target.avatarUrl)} onError={() => setFailedTargetAvatars((current) => new Set([...current, target.avatarUrl as string]))} source={{ uri: nativeFreshImageUri(target.avatarUrl, target.avatarUrl) }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} /> : <Text style={styles.shareTargetInitial}>{target.label.charAt(0).toUpperCase()}</Text>}
                        </View>
                        <Text numberOfLines={1} style={styles.shareTargetName}>{target.label}</Text>
                        <Text numberOfLines={1} style={styles.shareTargetSubtitle}>{target.subtitle || "Chat"}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
          <AppBottomSheetFooter>
            <View style={styles.shareActionRow}>
              <Pressable accessibilityRole="button" disabled={selectedKeys.size === 0 || sending || loading} onPress={shareToChat} style={({ pressed }) => [styles.shareSecondaryButton, selectedKeys.size === 0 || sending || loading ? styles.disabled : null, pressed ? styles.pressed : null]}>
                {sending ? <NativeSpinner tone="accent" /> : <NativeNavIcon color={huddleColors.blue} size={19} tab="chats" />}
                <Text style={styles.secondaryButtonText}>{formatNativeShareChatActionLabel(selectedKeys.size)}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { void onNativeShare(thread).then(onClose); }} style={({ pressed }) => [styles.shareSecondaryButton, pressed ? styles.pressed : null]}>
                <Feather color={huddleColors.blue} name="share-2" size={18} />
                <Text style={styles.secondaryButtonText}>Share</Text>
              </Pressable>
            </View>
          </AppBottomSheetFooter>
        </AppBottomSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionSheet: {
    backgroundColor: huddleColors.glassOverlay,
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    gap: huddleSpacing.x1,
    paddingBottom: huddleLayout.navHeight + huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x6,
    ...huddleShadows.glassElevation2,
  },
  categorySelectBlock: {
    position: "relative",
    zIndex: 12,
  },
  categorySelectCheckSlot: {
    height: huddleFormControls.select.checkSlot,
    width: huddleFormControls.select.checkSlot,
  },
  categorySelectField: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    flexDirection: "row",
    height: huddleLayout.fieldHeight,
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
  },
  categorySelectFieldFocused: {
    ...huddleFieldStates.focused,
  },
  categorySelectMenuInline: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
    backgroundColor: huddleColors.canvas,
    borderColor: huddleFormControls.select.menuBorderColor,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: huddleSpacing.x2,
    padding: huddleFormControls.select.menuPadding,
    zIndex: 90,
    ...huddleShadows.glassElevation1,
  },
  categorySelectMenuContent: {
    paddingBottom: huddleFormControls.select.menuPadding,
  },
  categorySelectOption: {
    alignItems: "center",
    borderRadius: huddleFormControls.select.optionRadius,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "space-between",
    minHeight: huddleFormControls.select.optionMinHeight,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
  },
  categorySelectOptionActive: {
    backgroundColor: huddleColors.glassControl,
  },
  categorySelectOptionText: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  categorySelectOptionTextActive: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
  },
  categorySelectText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
  },
  checkboxBox: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 4,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  checkboxBoxActive: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  checkboxRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x3,
  },
  checkboxText: {
    color: huddleColors.mutedText,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
  },
  commentActionText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  commentActionTextDestructive: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  commentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x4,
    marginTop: huddleSpacing.x2,
  },
  commentActionBadge: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    minWidth: huddleSocial.actionBadgeMinWidth,
    paddingHorizontal: huddleSpacing.x1,
    position: "absolute",
    right: -huddleSpacing.x1,
    top: -huddleSpacing.x1,
  },
  commentActionBadgeText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    textAlign: "center",
  },
  commentAuthor: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  commentAvatar: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    height: huddleSocial.replyAvatarSize,
    justifyContent: "center",
    overflow: "hidden",
    width: huddleSocial.replyAvatarSize,
  },
  commentAvatarText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  commentHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    justifyContent: "space-between",
  },
  commentIconActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSocial.actionClusterGap,
    justifyContent: "flex-end",
    marginLeft: "auto",
    marginTop: huddleSpacing.x1,
  },
  commentIconButton: {
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    minHeight: huddleSocial.actionButtonSize,
    minWidth: huddleSocial.actionButtonSize,
    justifyContent: "center",
    position: "relative",
  },
  commentIconButtonLikeActive: {
    backgroundColor: huddleColors.coralSoftFill,
  },
  commentSeeMoreButton: {
    alignSelf: "flex-start",
    marginTop: huddleSpacing.x1,
  },
  commentSeeMoreText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  commentStatusText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x1,
  },
  commentMentionText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    textDecorationLine: "none",
  },
  composerFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x1,
  },
  composerMentionField: {
    height: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    maxHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    overflow: "hidden",
    position: "relative",
  },
  composerMentionInput: {
    flexShrink: 1,
    minWidth: 0,
    color: "transparent",
    fontFamily: "Urbanist-500",
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 20,
    height: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    maxHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    paddingHorizontal: 0,
    overflow: "hidden",
    paddingTop: 0,
    paddingBottom: 0,
    textShadowColor: "transparent",
    textShadowRadius: 0,
    zIndex: 3,
  },
  composerMentionPlaceholder: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
  },
  composerMentionTextLayer: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    includeFontPadding: false,
    left: 0,
    lineHeight: 20,
    minHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    padding: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  composerFieldStack: {
    gap: huddleSpacing.x3,
  },
  composerPlainField: {
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: 0,
    justifyContent: "center",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: huddleFormFields.shadowOpacity,
    shadowRadius: 6,
    shadowOffset: { width: huddleFormFields.shadowOffset, height: huddleFormFields.shadowOffset },
    elevation: 1,
  },
  composerPlainFieldFocused: {
    ...huddleFieldStates.focused,
  },
  composerPlainFieldError: {
    ...huddleFieldStates.error,
  },
  composerPlainInput: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
    overflow: "hidden",
  },
  composerPlainTextArea: {
    minHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    justifyContent: "flex-start",
    paddingTop: huddleSpacing.x2,
  },
  commentList: {
    gap: huddleSpacing.x4,
    padding: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x6,
  },
  commentRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  commentText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  commentTime: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  composeFab: {
    ...huddleButtons.secondary,
    alignItems: "center",
    backgroundColor: huddleColors.glassChrome,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    height: huddleSocial.composeFabSize,
    justifyContent: "center",
    width: huddleSocial.composeFabSize,
  },
  composeFabWrap: {
    bottom: huddleLayout.navHeight + huddleSpacing.x8,
    height: huddleSocial.composeFabSize,
    position: "absolute",
    left: huddleSpacing.x4,
    width: huddleSocial.composeFabSize,
    zIndex: 30,
    elevation: 30,
  },
  composeFabPressed: {
    ...huddleButtons.pressed,
  },
  newPostsPill: {
    ...huddleButtons.primary,
    alignSelf: "center",
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
  },
  newPostsPillText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  newPostsPillPressed: {
    ...huddleButtons.pressed,
  },
  newPostsPillWrap: {
    left: 0,
    position: "absolute",
    right: 0,
    top: huddleSpacing.x2,
    zIndex: 40,
    elevation: 40,
    alignItems: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  dragHandle: {
    alignSelf: "center",
    backgroundColor: huddleColors.divider,
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x1,
    marginTop: huddleSpacing.x2,
    width: huddleSpacing.x7,
  },
  emptyCommentText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    textAlign: "center",
  },
  errorText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    textAlign: "center",
  },
  footerImageButton: {
    ...huddleGlassControls.borderlessSurface,
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  feedSkeletonAction: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x7,
    width: huddleSpacing.x10,
  },
  feedSkeletonActions: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
  },
  feedSkeletonAvatar: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x10,
    width: huddleSpacing.x10,
  },
  feedSkeletonBodyNarrow: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x3,
    width: "64%",
  },
  feedSkeletonBodyWide: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x3,
    width: "92%",
  },
  feedSkeletonCard: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.cardBorderSoft,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    gap: huddleSpacing.x2,
    padding: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
  },
  feedSkeletonHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginBottom: huddleSpacing.x2,
  },
  feedSkeletonHeaderBody: {
    flex: 1,
    gap: huddleSpacing.x2,
  },
  feedSkeletonMeta: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x2,
    width: "42%",
  },
  feedSkeletonName: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x3,
    width: "58%",
  },
  feedSkeletonStack: {
    gap: huddleSpacing.x4,
    paddingTop: huddleSpacing.x2,
  },
  feedSkeletonTitle: {
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x4,
    width: "72%",
  },
  mentionSuggestionAvatar: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x8,
    justifyContent: "center",
    overflow: "hidden",
    width: huddleSpacing.x8,
  },
  mentionSuggestionBody: {
    flex: 1,
    minWidth: 0,
  },
  mentionSuggestionHandle: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  mentionSuggestionInitial: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
  },
  mentionSuggestionList: {
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    marginTop: huddleSpacing.x2,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  mentionSuggestionName: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  mentionSuggestionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    minHeight: huddleLayout.minTouch,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  inlineCommentRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x3,
    position: "relative",
  },
  inlineReplies: {
    borderBottomColor: huddleColors.sectionDividerStrong,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: huddleSpacing.x2,
    marginLeft: huddleSocial.avatarSize + huddleSpacing.x3,
    paddingBottom: huddleSpacing.x4,
    paddingRight: huddleSpacing.x4,
  },
  inlineReplyComposer: {
    gap: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x2,
  },
  inlineReplyState: {
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x3,
  },
  feedSlideLayer: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: huddleLayout.navHeight + huddleSpacing.x8,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSocial.feedTopInset,
  },
  focusedThreadFrame: {
    backgroundColor: huddleColors.glassControl,
    borderRadius: huddleRadii.card,
    marginHorizontal: -huddleSpacing.x1,
    padding: huddleSpacing.x1,
  },
  mediaPickerBlock: {
    gap: huddleSpacing.x3,
  },
  mediaNoticeRow: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: huddleColors.glassControl,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  mediaNoticeText: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  mediaRailViewport: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: "100%",
    overflow: "hidden",
    width: "100%",
  },
  mediaThumbRow: {
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
    paddingRight: huddleSpacing.x6,
  },
  mediaThumbWrap: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.card,
    height: huddleSpacing.x10 + huddleSpacing.x8,
    overflow: "hidden",
  },
  mediaThumb: {
    height: "100%",
    width: "100%",
  },
  mediaUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: huddleColors.backdrop,
    gap: huddleSpacing.x1,
    justifyContent: "center",
  },
  mediaUploadingText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
  },
  mediaRemoveButton: {
    alignItems: "center",
    backgroundColor: huddleColors.backdrop,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: huddleSpacing.x2,
    top: huddleSpacing.x2,
    width: 28,
  },
  modalBackdrop: {
    backgroundColor: huddleColors.backdrop,
    flex: 1,
    justifyContent: "flex-end",
  },
  moreAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    minHeight: huddleLayout.ctaHeight,
    paddingHorizontal: huddleSpacing.x5,
  },
  moreActionText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
  },
  moreActionTextDestructive: {
    color: huddleColors.validationRed,
  },
  moreMenuBackdrop: {
    flex: 1,
    backgroundColor: huddleColors.backdrop,
  },
  moreMenuCard: {
    width: 250,
    overflow: "hidden",
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  pressed: {
    opacity: 0.76,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    borderRadius: huddleRadii.card,
    flex: 1,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    minHeight: 48,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  removeThumbButton: {
    alignItems: "center",
    backgroundColor: huddleColors.backdrop,
    borderRadius: huddleRadii.pill,
    height: huddleSpacing.x6,
    justifyContent: "center",
    position: "absolute",
    right: huddleSpacing.x1,
    top: huddleSpacing.x1,
    width: huddleSpacing.x6,
  },
  replyComposer: {
    backgroundColor: huddleColors.canvas,
    borderTopColor: huddleColors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x5,
  },
  replyInputField: {
    flex: 1,
    minWidth: 0,
  },
  replyInputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  replyComposerControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "space-between",
    marginTop: huddleSocial.replyComposerControlsMarginTop,
  },
  replyComposerField: {
    backgroundColor: huddleColors.canvas,
    borderRadius: huddleSocial.replyComposerRadius,
    justifyContent: "space-between",
    minHeight: huddleSocial.replyComposerMinHeight,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
    position: "relative",
    ...huddleFieldStates.focused,
    ...huddleShadows.glassElevation1,
  },
  replyComposerInputViewport: {
    height: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    maxHeight: SOCIAL_COMPOSER_TEXTAREA_HEIGHT,
    overflow: "hidden",
    position: "relative",
  },
  replyComposerInput: {
    backgroundColor: "transparent",
    color: huddleColors.text,
    flexShrink: 1,
    minWidth: 0,
    includeFontPadding: false,
    padding: 0,
    overflow: "hidden",
  },
  replyComposerMentionText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-600",
    textDecorationLine: "none",
  },
  replyComposerIconButton: {
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: huddleSocial.replyComposerControlSize,
    justifyContent: "center",
    width: huddleSocial.replyComposerControlSize,
  },
  replyQuote: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    backgroundColor: huddleColors.mutedCanvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    marginBottom: huddleSpacing.x1,
    marginTop: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
  },
  replyQuoteBodyBlock: {
    flex: 1,
    minWidth: 0,
  },
  replyQuoteImage: {
    height: "100%",
    width: "100%",
  },
  replyQuoteImageFrame: {
    alignItems: "center",
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.card,
    height: huddleSpacing.x7 + huddleSpacing.x2,
    justifyContent: "center",
    overflow: "hidden",
    width: huddleSpacing.x9,
  },
  replyQuoteText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  replyQuoteBody: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  replyMediaImage: {
    backgroundColor: huddleColors.mutedCanvas,
    borderRadius: huddleRadii.card,
    height: huddleSpacing.x10,
    width: huddleSpacing.x10,
  },
  replyMediaRow: {
    gap: huddleSpacing.x2,
    paddingTop: huddleSpacing.x2,
  },
  replyMediaButton: {
    ...huddleGlassControls.surface,
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: huddleLayout.minTouch,
    justifyContent: "center",
    width: huddleLayout.minTouch,
  },
  replyRail: {
    backgroundColor: huddleSocial.replyRailColor,
    bottom: -huddleSpacing.x2,
    position: "absolute",
    top: 0,
    width: huddleSocial.replyRailWidth,
  },
  replyChildRail: {
    backgroundColor: huddleSocial.replyRailColor,
    bottom: -huddleSpacing.x2,
    position: "absolute",
    top: huddleSocial.replyChildRailTop,
    width: huddleSocial.replyRailWidth,
  },
  replyRailDot: {
    backgroundColor: huddleSocial.replyRailDotColor,
    borderColor: huddleColors.canvas,
    borderRadius: huddleRadii.pill,
    borderWidth: 2,
    height: huddleSocial.replyRailDotSize,
    position: "absolute",
    transform: [{ translateX: -huddleSocial.replyRailDotSize / 2 }],
    top: huddleSocial.replyRailDotTop,
    width: huddleSocial.replyRailDotSize,
    zIndex: 1,
  },
  replySendButton: {
    alignItems: "center",
    backgroundColor: huddleColors.blue,
    borderRadius: huddleRadii.pill,
    height: huddleSocial.replyComposerControlSize,
    justifyContent: "center",
    width: huddleSocial.replyComposerControlSize,
  },
  replySendButtonDisabled: {
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  replyTargetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
  },
  replyTargetText: {
    color: huddleColors.caption,
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  reportCategoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x3,
    minHeight: huddleLayout.minTouch,
  },
  reportCategoryText: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  reportIntro: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  retryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginTop: huddleSpacing.x4,
  },
  retryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  root: {
    backgroundColor: huddleColors.canvas,
    flex: 1,
    position: "relative",
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
  },
  secondaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  sheet: {
    backgroundColor: huddleColors.canvas,
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    maxHeight: "88%",
    overflow: "hidden",
    ...huddleShadows.glassElevation2,
  },
  sheetContent: {
    gap: huddleSpacing.x4,
    padding: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x7,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetHeader: {
    alignItems: "center",
    borderBottomColor: huddleColors.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: huddleLayout.headerHeight,
    paddingLeft: huddleSpacing.x4,
    paddingRight: huddleSpacing.x2,
  },
  sheetIconButton: {
    alignItems: "center",
    borderRadius: huddleRadii.pill,
    height: huddleLayout.minTouch,
    justifyContent: "center",
    width: huddleLayout.minTouch,
  },
  sheetTall: {
    backgroundColor: huddleColors.canvas,
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    height: "88%",
    overflow: "hidden",
    ...huddleShadows.glassElevation2,
  },
  sheetTitle: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
  },
  shareActionRow: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  shareSecondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  shareSheetContent: {
    gap: huddleSpacing.x4,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x3,
  },
  shareSearchField: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    marginHorizontal: huddleSpacing.x6,
    minHeight: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x3,
  },
  shareSearchInput: {
    color: huddleColors.text,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    minHeight: huddleLayout.fieldHeight - huddleSpacing.x2,
    padding: 0,
    overflow: "hidden",
  },
  shareTarget: {
    alignItems: "center",
    width: huddleSpacing.x10 - huddleSpacing.x1,
  },
  shareTargetAvatar: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    height: huddleSpacing.x9,
    justifyContent: "center",
    overflow: "hidden",
    width: huddleSpacing.x9,
    ...huddleShadows.glassElevation1,
  },
  shareTargetAvatarImage: {
    height: "100%",
    width: "100%",
  },
  shareTargetAvatarSelected: {
    borderColor: huddleColors.blue,
    borderWidth: 2,
  },
  shareTargetInitial: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
  },
  shareTargetName: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    marginTop: huddleSpacing.x2,
    maxWidth: huddleSpacing.x10 - huddleSpacing.x1,
  },
  shareTargetRow: {
    gap: huddleSpacing.x3,
    paddingLeft: huddleSpacing.x5,
    paddingRight: huddleSpacing.x6,
  },
  shareTargetSubtitle: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    maxWidth: huddleSpacing.x10 - huddleSpacing.x1,
  },
  shareTargetsBlock: {
    justifyContent: "center",
  },
  videoThumb: {
    alignItems: "center",
    backgroundColor: huddleColors.text,
    flex: 1,
    justifyContent: "center",
  },
  wordCounter: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  wordCounterError: {
    color: huddleColors.validationRed,
  },
  replyMediaCarouselWrap: {
    alignSelf: "stretch",
    marginTop: huddleSpacing.x2,
    maxWidth: "100%",
    overflow: "hidden",
  },

});
