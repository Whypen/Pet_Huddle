import { Feather, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Fragment, createRef, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
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
import { normalizeQuotaTier, quotaConfig } from "../lib/quotaConfig_v1";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeSocialEmptyState, NativeSocialExternalLinkPreview, NativeSocialFeedCard, NativeSocialFilterBar, NativeSocialMediaCarousel } from "../components/social/NativeSocialFeedPrimitives";
import { NativeSocialReplyComposerInput } from "../components/social/NativeSocialReplyComposerInput";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { buildNativeReplyTree, type NativeSocialThreadedReply } from "../components/social/nativeSocialReplyTree";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppDestructiveSlideConfirm, AppModalActionRow, AppModalButton, AppModalCard, AppModalCloseButton, AppModalScroll, SlideToConfirm } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { fetchNativeProfileSummary } from "../lib/nativeProfileSummary";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import { resolveNativeViewerScope, type NativeViewerScope } from "../lib/nativeViewerScope";
import {
  areNativeSocialUsersBlocked,
  blockNativeSocialUser,
  createNativeSocialMentionNotifications,
  createNativeSocialComment,
  createNativeSocialThread,
  createNativeSocialVideoUpload,
  cleanupNativeSocialStorageImages,
  deleteNativeSocialComment,
  deleteNativeSocialThread,
  extractNativeSocialFirstHttpUrl,
  fetchNativeSocialComments,
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
  updateNativeSupportedSocialThreadCache,
  resolveNativeSocialMentionsFromText,
  upsertNativeSocialNotificationWindow,
  updateNativeSocialComment,
  updateNativeSocialThread,
  uploadNativeSocialImage,
  writeNativeSocialStoredState,
  type NativeSocialComment,
  type NativeSocialComposerMedia,
  type NativeSocialFeedCursor,
  type NativeSocialLinkPreview,
  type NativeSocialMentionSuggestion,
  type NativeSocialShareTarget,
  type NativeSocialSortMode,
  type NativeSocialThread,
} from "../lib/nativeSocial";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, type NativeProtectedActionCleanupResult } from "../lib/nativeStorageCleanup";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleFormFields,
  huddleLayout,
  huddleMotion,
  huddleRadii,
  huddleShadows,
  huddleSocial,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeSocialScreenProps = {
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

type NativeActionMenuAnchor = { x: number; y: number } | null;

type NativeSocialComposerUploadMedia = NativeSocialComposerMedia & {
  error?: string | null;
  status?: "queued" | "uploading" | "uploaded" | "error";
  uploadedUrl?: string | null;
};

const REFRESH_DEBOUNCE_MS = 7000;
const LINK_PREVIEW_DEBOUNCE_MS = 650;
const SOCIAL_EFFECT_DEBOUNCE_MS = 450;
const SOCIAL_REALTIME_REFRESH_COOLDOWN_MS = 1000;

const SOCIAL_FEED_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_COMMENTS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const SOCIAL_INITIAL_COMMENT_LIMIT = 5;
const SOCIAL_OLDER_COMMENT_LIMIT = 10;
const nativeSocialScreenSessionKey = (userId: string | null, sessionKey?: string | null) =>
  String(sessionKey || (userId ? `${userId}:0` : "anon:0"));

const nativeSocialCommentsCacheKey = (userId: string, sessionKey: string, thread: Pick<NativeSocialThread, "id" | "commentCount" | "createdAt" | "updatedAt">) =>
  `native-social-comments:v4:${userId}:${sessionKey}:${thread.id}:${thread.commentCount}:${thread.updatedAt || thread.createdAt}`;
const nativeSocialFeedCacheKey = (userId: string, sessionKey: string, country: string | null, sortMode: string) =>
  `native-social-feed:v4:${userId}:${sessionKey}:${country || "global"}:${sortMode}`;

const readNativeSocialPersistentCache = async <T,>(key: string, maxAgeMs: number): Promise<T | null | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(key);
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
    if (__DEV__) console.log("NATIVE_SOCIAL_CACHE_PURGE", { userId: cleanUserId, count: removals.length, threadId: options?.commentsOnlyForThreadId || null });
  } catch {
    // Cache purge is best-effort; server refresh remains authoritative.
  }
};

const mergeNativeSocialThreadsByRefresh = (current: NativeSocialThread[], fresh: NativeSocialThread[]) => {
  const existingById = new Map(current.map((thread) => [thread.id, thread]));
  const mergedFresh = fresh.map((thread) => ({ ...(existingById.get(thread.id) || {}), ...thread }));
  const freshIds = new Set(fresh.map((thread) => thread.id));
  const oldestFreshMs = fresh.reduce((oldest, thread) => {
    const parsed = new Date(thread.createdAt).getTime();
    return Number.isFinite(parsed) ? Math.min(oldest, parsed) : oldest;
  }, Number.POSITIVE_INFINITY);
  const olderLoaded = Number.isFinite(oldestFreshMs)
    ? current.filter((thread) => {
      if (freshIds.has(thread.id)) return false;
      const parsed = new Date(thread.createdAt).getTime();
      return Number.isFinite(parsed) && parsed < oldestFreshMs;
    })
    : [];
  return [...mergedFresh, ...olderLoaded];
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

const MAX_COMPOSER_WORDS = 500;
const MAX_COMPOSER_MEDIA = 10;
const DELETE_THREAD_TIMEOUT_MS = 12000;
const MIN_THREAD_MEDIA_ASPECT = 9 / 16;
const MAX_THREAD_MEDIA_ASPECT = 1.91;
const PULL_REFRESH_THRESHOLD = 44;
const COMMENT_SNAP_DELAY_MS = 80;
const COMMENT_SNAP_INTENT_TTL_MS = 600;
const SOCIAL_TAGS = ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"];
const SOCIAL_TAG_ALIASES: Record<string, string[]> = {
  Events: ["Events", "Meetup"],
  Market: ["Market", "Marketplace"],
};

const resolveNativeShareMediaUrl = async (mediaUrl: string) => {
  const trimmed = mediaUrl.trim();
  if (!trimmed || !FileSystem.cacheDirectory) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return trimmed;
    const extensionMatch = parsed.pathname.match(/\.(jpe?g|png|webp|gif|mp4|mov)$/i);
    const extension = extensionMatch?.[1]?.toLowerCase() || "jpg";
    const localUri = `${FileSystem.cacheDirectory}social-share-${encodeURIComponent(trimmed).slice(0, 72)}.${extension}`;
    const existing = await FileSystem.getInfoAsync(localUri);
    if (existing.exists) return localUri;
    const downloaded = await FileSystem.downloadAsync(trimmed, localUri);
    return downloaded.uri;
  } catch {
    return null;
  }
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
    .map((url) => ({
      durationSeconds: null,
      kind: "image" as const,
      status: "uploaded" as const,
      uri: url.trim(),
      uploadedUrl: url.trim(),
    }))
    .slice(0, MAX_COMPOSER_MEDIA);
};

const insertNativeMention = (value: string, activeQuery: NativeActiveMentionQuery | null, suggestion: NativeSocialMentionSuggestion) => {
  if (!activeQuery) return value;
  const before = value.slice(0, activeQuery.tokenStart);
  const after = value.slice(activeQuery.tokenEnd);
  const suffix = after.startsWith(" ") || after.length === 0 ? after : ` ${after}`;
  return `${before}@${suggestion.socialId} ${suffix}`.replace(/[ \t]{2,}/g, " ");
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
  onOpenProfile: (userId: string) => void,
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

function NativeSocialCommentMediaCarousel({ images }: { images: string[] }) {
  const [width, setWidth] = useState(0);
  if (images.length === 0) return null;

  return (
    <View
      style={styles.replyMediaCarouselWrap}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    >
      <NativeSocialMediaCarousel
        contentWidth={Math.max(1, width || 1)}
        items={images.map((uri) => ({ uri, kind: "image" as const }))}
        maxFrameHeight={280}
      />
    </View>
  );
}

function NativeSocialCompactReplyQuote({ comment }: { comment: NativeSocialComment }) {
  const image = comment.images[0] || "";
  return (
    <View style={styles.replyQuote}>
      {image ? (
        <View style={styles.replyQuoteImageFrame}>
          <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="contain" source={{ uri: image }} style={styles.replyQuoteImage as ImageStyle} transition={120} />
        </View>
      ) : null}
      <View style={styles.replyQuoteBodyBlock}>
        <Text numberOfLines={1} style={styles.replyQuoteText}>{comment.author.socialId || comment.author.displayName || "Reply"}</Text>
        <Text numberOfLines={3} style={styles.replyQuoteBody}>{comment.content || "Media reply"}</Text>
      </View>
    </View>
  );
}

export function NativeSocialScreen({
  accessToken,
  sessionKey,
  userId,
  search,
  onBottomSheetOpenChange,
  onNavigate,
  onScrollTopRef,
}: NativeSocialScreenProps) {
  const [threads, setThreads] = useState<NativeSocialThread[]>([]);
  const [query, setQuery] = useState(() => sanitizeSearch(search));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<NativeSocialSortMode>("Latest");
  const [feedScopeCountry, setFeedScopeCountry] = useState<string | null>(null);
  const [viewerScope, setViewerScope] = useState<NativeViewerScope | null>(null);
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hideComposeFab, setHideComposeFab] = useState(false);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [moreThread, setMoreThread] = useState<NativeSocialThread | null>(null);
  const [moreThreadAnchor, setMoreThreadAnchor] = useState<NativeActionMenuAnchor>(null);
  const [reportThread, setReportThread] = useState<NativeSocialThread | null>(null);
  const [shareThread, setShareThread] = useState<NativeSocialThread | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

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
  const [deleteThreadTarget, setDeleteThreadTarget] = useState<NativeSocialThread | null>(null);
  const [blockThreadTarget, setBlockThreadTarget] = useState<NativeSocialThread | null>(null);
  const [blockCommentTarget, setBlockCommentTarget] = useState<NativeSocialComment | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [quotaModalMessage, setQuotaModalMessage] = useState("");
  const [socialRestrictionModalOpen, setSocialRestrictionModalOpen] = useState(false);
  const [isGoldUser, setIsGoldUser] = useState(false);
  const [socialPostingTier, setSocialPostingTier] = useState<"free" | "plus" | "gold">("free");
  const [socialPostingBlocked, setSocialPostingBlocked] = useState(false);
  const [feedScopeResolved, setFeedScopeResolved] = useState(false);
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

  useEffect(() => {
    const open = composerOpen || moreThread !== null || reportThread !== null || shareThread !== null || profileUserId !== null || commentReportTarget !== null || deleteThreadTarget !== null || blockThreadTarget !== null || blockCommentTarget !== null || moreCommentTarget !== null;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [blockCommentTarget, blockThreadTarget, commentReportTarget, composerOpen, deleteThreadTarget, moreCommentTarget, moreThread, onBottomSheetOpenChange, profileUserId, reportThread, shareThread]);

  const requestIdRef = useRef(0);
  const socialSessionKeyRef = useRef(currentSessionKey);
  const feedLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const feedSessionIdRef = useRef(`feed-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const lastRefreshAtRef = useRef(0);
  const lastScrollOffsetRef = useRef(0);
  const composeFabTranslateYRef = useRef(new Animated.Value(0));
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
  const listViewportRef = useRef<View | null>(null);
  const listHeightRef = useRef(0);
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
  const realtimeCommentRefreshInFlightRef = useRef<Set<string>>(new Set());
  const realtimeCommentRefreshLastAtRef = useRef<Map<string, number>>(new Map());
  const realtimeCommentRefreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const socialReportRollbackRef = useRef<null | (() => void)>(null);
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
    realtimeThreadRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    realtimeThreadRefreshTimersRef.current.clear();
    realtimeCommentRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    realtimeCommentRefreshTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const params = parseSocialParams(search);
    if (params.focus) {
      const requestSessionKey = currentSessionKey;
      void fetchNativeSocialThreadById(params.focus, accessToken).then((thread) => {
        if (socialSessionKeyRef.current !== requestSessionKey) return;
        if (!thread) return;
        setThreads((current) => current.some((item) => item.id === thread.id) ? current : [thread, ...current]);
        if (params.mode === "comments" || !params.mode) {
          setExpandedReplies((current) => new Set([...current, thread.id]));
          void loadCommentsForThread(thread);
        }
        if (params.mode === "share") setShareThread(thread);
        if (params.mode === "profile") setProfileUserId(params.profileUser || thread.userId);
      });
    }
    if (params.mode === "compose") setComposerOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, currentSessionKey, search]);

  useEffect(() => {
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
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBlockedUsers(new Set());
      setIsGoldUser(false);
      setSocialPostingTier("free");
      setSocialPostingBlocked(false);
      setFeedScopeCountry(null);
      setViewerScope(null);
      setFeedScopeResolved(true);
      return;
    }
    let active = true;
    setFeedScopeResolved(false);
    const requestSessionKey = currentSessionKey;
    void loadNativeBlockedSocialUserIds(userId, accessToken)
      .then((ids) => { if (active && socialSessionKeyRef.current === requestSessionKey) setBlockedUsers(ids); })
      .catch(() => undefined);
    void Promise.allSettled([
      fetchNativeProfileSummary(userId, { force: false, accessToken }),
      resolveNativeViewerScope({ userId, accessToken }),
    ]).then(([profileResult, scopeResult]) => {
      if (!active || socialSessionKeyRef.current !== requestSessionKey) return;
      const snapshot = profileResult.status === "fulfilled" ? profileResult.value : null;
      const scope = scopeResult.status === "fulfilled" ? scopeResult.value : null;
      const tier = normalizeQuotaTier(snapshot?.profile?.effective_tier || snapshot?.profile?.tier || "free");
      setSocialPostingTier(tier);
      setIsGoldUser(tier === "gold");
      setViewerScope(scope);
      const country = typeof scope?.country === "string" ? scope.country.trim().toLowerCase() : "";
      setFeedScopeCountry(country || null);
    }).finally(() => { if (active) setFeedScopeResolved(true); });
    void isNativeRestrictionActive("social_posting_disabled").then((blocked) => { if (active && socialSessionKeyRef.current === requestSessionKey) setSocialPostingBlocked(blocked); });
    return () => { active = false; };
  }, [accessToken, currentSessionKey, syncCommentSupportFromRows, userId]);

  useEffect(() => () => {
    dwellTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    dwellTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (hideComposeFab) {
      Animated.timing(composeFabTranslateYRef.current, {
        duration: huddleMotion.durations.base,
        toValue: 100,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(composeFabTranslateYRef.current, {
        toValue: 0,
        friction: 7,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }
  }, [hideComposeFab]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? "" : current)), 2200);
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

  const load = useCallback(async (mode: "reset" | "more" | "refresh" = "reset") => {
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
    if (mode === "more" && (!hasMoreRef.current || loadingMoreRef.current)) return;
    if (mode === "refresh") {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < REFRESH_DEBOUNCE_MS) return;
      lastRefreshAtRef.current = now;
    }
    const requestId = ++requestIdRef.current;
    const requestSessionKey = currentSessionKey;
    const cacheWriteGuard = () => socialSessionKeyRef.current === requestSessionKey;
    const currentSortMode = sortModeRef.current;
    const scopePoint = viewerScope?.primaryPoint ?? null;
    const scopeKey = JSON.stringify({
      adminArea: viewerScope?.adminArea ?? null,
      city: viewerScope?.city ?? null,
      country: viewerScope?.country ?? null,
      countryCode: viewerScope?.countryCode ?? null,
      district: viewerScope?.district ?? null,
      lat: typeof scopePoint?.lat === "number" ? Number(scopePoint.lat.toFixed(4)) : null,
      lng: typeof scopePoint?.lng === "number" ? Number(scopePoint.lng.toFixed(4)) : null,
      source: viewerScope?.source ?? null,
    });
    const feedCacheKey = nativeSocialFeedCacheKey(userId, requestSessionKey, feedScopeCountry, currentSortMode);
    const loadGateKey = JSON.stringify({
      country: feedScopeCountry || "global",
      cursor: mode === "more" ? cursorRef.current : null,
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
      if (cachedFeed?.rows?.length) {
        setThreads(cachedFeed.rows);
        setCursor(cachedFeed.cursor as NativeSocialFeedCursor | null);
        setHasMore(cachedFeed.hasMore);
        setLoading(false);
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
    if (mode === "refresh") setRefreshing(true);
    if (mode === "more") setLoadingMore(true);
    setError("");
    try {
      const page = await fetchNativeSocialFeedPage({
        accessToken,
        viewerId: userId,
        sortMode: currentSortMode,
        cursor: mode === "more" ? cursorRef.current : null,
        viewerScope,
      });
      if (requestIdRef.current !== requestId || !cacheWriteGuard()) return;
      setThreads((current) => {
        if (mode === "refresh") {
          const merged = mergeNativeSocialThreadsByRefresh(current, page.rows);
          if (cacheWriteGuard() && merged.length > 0) {
            void writeNativeSocialPersistentCache(feedCacheKey, {
              rows: merged.slice(0, 50),
              cursor: cursorRef.current,
              hasMore: hasMoreRef.current,
            });
          }
          return merged;
        }
        if (mode !== "more") return page.rows;
        const existing = new Set(current.map((thread) => thread.id));
        return [...current, ...page.rows.filter((thread) => !existing.has(thread.id))];
      });
      if (mode !== "refresh") {
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      }
      if (mode !== "more" && page.rows.length > 0 && cacheWriteGuard()) {
        void writeNativeSocialPersistentCache(feedCacheKey, {
          rows: page.rows.slice(0, 50),
          cursor: page.cursor,
          hasMore: page.hasMore,
        });
      }
    } catch {
      if (requestIdRef.current === requestId && mode === "reset") setError("Unable to load Social right now.");
    } finally {
      if (feedLoadGateRef.current.key === loadGateKey) feedLoadGateRef.current.inFlight = false;
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [accessToken, currentSessionKey, feedScopeCountry, feedScopeResolved, userId, viewerScope]);

  useEffect(() => {
    if (!feedScopeResolved) return;
    void load("reset");
  }, [feedScopeResolved, load, sortMode]);

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
    return [...searched].sort((a, b) => {
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
  }, [blockedUsers, commentsByThread, hiddenThreadIds, query, selectedTags, sortMode, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, storedSets.status, threads]);

  const loadedThreadIdsKey = useMemo(() => threads.map((thread) => thread.id).filter(Boolean).sort().join(","), [threads]);
  const visibleThreadIdsKey = useMemo(() => visibleThreads.map((thread) => thread.id).join(","), [visibleThreads]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedVisibleThreadIdsKey(visibleThreadIdsKey), SOCIAL_EFFECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visibleThreadIdsKey]);

  useEffect(() => {
    if (!userId || !accessToken || !loadedThreadIdsKey) return undefined;
    let active = true;
    const requestSessionKey = currentSessionKey;
    const ids = loadedThreadIdsKey.split(",").filter(Boolean);
    void fetchNativeSocialPostPreferences(ids, accessToken)
      .then((preferences) => {
        if (!active || socialSessionKeyRef.current !== requestSessionKey) return;
        applyDbPreferences(preferences, "replaceVisible", ids);
      })
      .catch(() => {
        if (active && socialSessionKeyRef.current === requestSessionKey) showNotice("Saved and pinned posts could not sync.");
      });
    return () => { active = false; };
  }, [accessToken, applyDbPreferences, currentSessionKey, loadedThreadIdsKey, showNotice, userId]);

  const showQuotaBanner = useCallback((message: string) => {
    setQuotaModalMessage(message);
  }, []);

  const openPostingRestriction = useCallback(() => {
    setSocialRestrictionModalOpen(true);
  }, []);

  const resolvePostingBlockedMessage = useCallback((error: unknown) => {
    const raw = String((error as { message?: string })?.message || "");
    const lower = raw.toLowerCase();
    if (lower.includes("quota") || lower.includes("limit") || lower.includes("rate")) {
      return quotaConfig.copy.threads.exhausted[socialPostingTier];
    }
    return null;
  }, [socialPostingTier]);

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
          const nextThreads = current.map((thread) => (
            thread.id === threadId
              ? { ...thread, ...freshThread }
              : thread
          ));
          if (cacheWriteGuard() && nextThreads.length > 0) {
            void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, requestSessionKey, feedScopeCountry, sortModeRef.current), {
              rows: nextThreads.slice(0, 50),
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
  }, [accessToken, currentSessionKey, feedScopeCountry, userId]);

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

            scheduleRealtimeThreadRefresh(changedThreadId);
          },
        );
      });
      return channel;
    });

    return () => {
      void handle.dispose();
    };
  }, [debouncedVisibleThreadIdsKey, scheduleRealtimeThreadRefresh, userId]);

  useEffect(() => {
    if (!userId || !debouncedVisibleThreadIdsKey) return undefined;
    const ids = debouncedVisibleThreadIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) return undefined;
    const subscriptionSessionKey = currentSessionKey;

    const handle = createSingleRealtimeChannel(`native-social-threads:${ids.slice().sort().join(",")}`, (channel) => {
      ids.forEach((threadId) => {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "threads", filter: `id=eq.${threadId}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setThreads((current) => {
                const nextThreads = current.filter((thread) => thread.id !== threadId);
                if (socialSessionKeyRef.current === subscriptionSessionKey) {
                  void writeNativeSocialPersistentCache(nativeSocialFeedCacheKey(userId, subscriptionSessionKey, feedScopeCountry, sortModeRef.current), {
                    rows: nextThreads.slice(0, 50),
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
  }, [currentSessionKey, debouncedVisibleThreadIdsKey, feedScopeCountry, scheduleRealtimeThreadRefresh, userId]);

  const visiblePreviewUrlsKey = useMemo(() => (
    Array.from(new Set([
      ...visibleThreads.map((thread) => extractNativeSocialFirstHttpUrl(thread.content)),
      ...Object.values(commentsByThread).flat().map((comment) => extractNativeSocialFirstHttpUrl(comment.content)),
      extractNativeSocialFirstHttpUrl(replyDraft),
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
    if (!titleValue || !contentValue) return showNotice("Title and content are required.");
    if (countWords(contentValue) > MAX_COMPOSER_WORDS) return showNotice("Post is too long.");
    const videoMedia = payload.media.find((item) => item.kind === "video");
    if (videoMedia && !isGoldUser) return showNotice("Video upload is available for Gold members only.");
    if (videoMedia && editingThread?.providerVideoId) return showNotice("Only one video can be added to a post.");
    const uploadedForCleanup: string[] = [];
    const optimisticId = `pending:thread:${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticImages = payload.media.filter((item) => item.kind === "image").map((item) => item.uploadedUrl || item.uri).filter(Boolean);
    const previousEditingThread = editingThread;
    const optimisticThread: NativeSocialThread = {
      id: previousEditingThread?.id || optimisticId,
      title: titleValue,
      content: contentValue,
      tags: [payload.category || "Social"],
      hashtags: [],
      mentions: previousEditingThread?.mentions || [],
      images: optimisticImages,
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
      videoProvider: previousEditingThread?.videoProvider || null,
      providerVideoId: previousEditingThread?.providerVideoId || null,
      videoPlaybackUrl: previousEditingThread?.videoPlaybackUrl || null,
      videoEmbedUrl: previousEditingThread?.videoEmbedUrl || null,
      videoThumbnailUrl: previousEditingThread?.videoThumbnailUrl || null,
      videoPreviewUrl: previousEditingThread?.videoPreviewUrl || null,
      videoDurationSeconds: previousEditingThread?.videoDurationSeconds || null,
      videoStatus: previousEditingThread?.videoStatus || null,
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
    setThreads((current) => previousEditingThread
      ? current.map((thread) => thread.id === previousEditingThread.id ? optimisticThread : thread)
      : [optimisticThread, ...current]);
    closeComposer();
    try {
      const imageMedia = payload.media.filter((item) => item.kind === "image");
      const imageUrls = await Promise.all(imageMedia.map(async (media) => {
        if (typeof media.uploadedUrl === "string" && media.uploadedUrl.trim().length > 0) return media.uploadedUrl.trim();
        if (media.uri.startsWith("http")) return media.uri;
        const uploadedUrl = await uploadNativeSocialImage(userId, media, "thread", accessToken);
        uploadedForCleanup.push(uploadedUrl);
        return uploadedUrl;
      }));
      const video = videoMedia ? await createNativeSocialVideoUpload(userId, videoMedia, titleValue, accessToken) : null;
      const mentions = await resolveNativeSocialMentionsFromText(contentValue, accessToken);
      if (editingThread) {
        const mergedImages = imageUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
        await updateNativeSocialThread({
          accessToken,
          category: payload.category,
          content: contentValue,
          id: editingThread.id,
          images: mergedImages,
          isSensitive: payload.isSensitive,
          previousImages: editingThread.images,
          title: titleValue,
          userId,
          video,
        });
        await persistNativeSocialPostMentions(editingThread.id, mentions, accessToken);
        if (mentions.length > 0) await createNativeSocialMentionNotifications(editingThread.id, userId, mentions.map((entry) => entry.mentionedUserId), accessToken);
        const freshThread = await fetchNativeSocialThreadById(editingThread.id, accessToken);
        setThreads((current) => {
          const nextThreads = current.map((thread) => thread.id === editingThread.id ? {
            ...thread,
            ...(freshThread || {}),
            title: freshThread?.title ?? titleValue,
            content: freshThread?.content ?? contentValue,
            tags: freshThread?.tags ?? [payload.category],
            images: freshThread?.images ?? mergedImages,
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
            rows: nextThreads.slice(0, 50),
            cursor: cursorRef.current,
            hasMore: hasMoreRef.current,
          });
          return nextThreads;
        });
        haptic.success();
        showNotice("Post updated.");
      } else {
        const id = await createNativeSocialThread({ accessToken, category: payload.category, content: contentValue, images: imageUrls, isSensitive: payload.isSensitive, title: titleValue, userId, video });
        if (id) {
          await persistNativeSocialPostMentions(id, mentions, accessToken);
          if (mentions.length > 0) await createNativeSocialMentionNotifications(id, userId, mentions.map((entry) => entry.mentionedUserId), accessToken);
          const createdThread = await fetchNativeSocialThreadById(id, accessToken);
          if (createdThread) {
            setThreads((current) => [createdThread, ...current.filter((thread) => thread.id !== id && thread.id !== optimisticId)]);
          } else {
            setThreads((current) => current.map((thread) => thread.id === optimisticId ? { ...optimisticThread, id, localStatus: undefined } : thread));
          }
          haptic.success();
          showNotice("Thread posted.");
        } else {
          throw new Error("Unable to create thread.");
        }
      }
    } catch (error) {
      if (uploadedForCleanup.length > 0) {
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeSocialStorageImages(uploadedForCleanup, userId, accessToken, "social_thread_orphan_upload").catch(() => "failed" as const);
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
        message: error instanceof Error ? error.message : String(error),
        threadId: optimisticThread.id,
      });
      setThreads((current) => previousEditingThread
        ? current.map((thread) => thread.id === previousEditingThread.id ? previousEditingThread : thread)
        : current.filter((thread) => thread.id !== optimisticId));
      const quotaMessage = resolvePostingBlockedMessage(error);
      showQuotaBanner(quotaMessage || "Unable to save post.");
    }
  }, [accessToken, closeComposer, currentSessionKey, editingThread, feedScopeCountry, isGoldUser, openPostingRestriction, refreshAroundMutation, resolvePostingBlockedMessage, showNotice, showQuotaBanner, socialPostingBlocked, userId]);

  const openNativeShare = useCallback(async (thread: NativeSocialThread) => {
    const shareUrl = `https://huddle.pet/share/${encodeURIComponent(thread.id)}`;
    const imageUrl = thread.images[0] || thread.videoThumbnailUrl || thread.videoPreviewUrl || "";
    const mediaShareUrl = imageUrl ? await resolveNativeShareMediaUrl(imageUrl) : null;
    const message = [
      thread.title || "See this post on huddle.",
      shareUrl,
      imageUrl && !mediaShareUrl && imageUrl !== shareUrl ? imageUrl : "",
    ].filter(Boolean).join("\n");
    try {
      await Share.share({ title: thread.title || "Post on huddle", message, url: mediaShareUrl || shareUrl });
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
    void setNativeSocialSupport(thread, userId, isSupported, accessToken)
      .then(async (count) => {
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, likes: count } : item));
        if (!isSupported) {
          recordFeedEvent(thread.id, "like");
          if (thread.userId !== userId) {
            try {
              const profile = await fetchNativeProfileSummary(userId, { force: false, accessToken });
              await upsertNativeSocialNotificationWindow({
                actorId: userId,
                actorName: profile?.profile?.display_name || "Someone",
                category: "social",
                href: `/social?focus=${thread.id}`,
                kind: "like",
                ownerUserId: thread.userId,
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
  }, [accessToken, blockedUsers, recordFeedEvent, refreshAroundMutation, showNotice, supportedThreadIds, userId]);

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
    if (__DEV__) console.log("NATIVE_SOCIAL_POST_DELETE_OPTIMISTIC_START", { threadId });
    try {
      const deleteResult = await Promise.race<boolean>([
        deleteNativeSocialThread(thread, userId, accessToken).finally(() => {
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
        showNotice(`Unable to delete post.${message ? ` ${message}` : ""}`);
      }
      if (__DEV__) console.warn("NATIVE_SOCIAL_POST_DELETE_OPTIMISTIC_ROLLBACK", { message, threadId });
      setThreads(previousThreads);
    } finally {
      setDeletingThreadId((current) => (current === threadId ? null : current));
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [accessToken, deleteThreadTarget, deletingThreadId, replyFor, showNotice, threads, userId]);

  const executeBlockThreadAuthor = useCallback(() => {
    if (!blockThreadTarget || !userId) return;
    const thread = blockThreadTarget;
    const previousThreads = threads;
    const previousBlockedUsers = blockedUsers;
    setBlockThreadTarget(null);
    setBlockedUsers((current) => new Set([...current, thread.userId]));
    setThreads((current) => current.filter((item) => item.userId !== thread.userId));
    if (__DEV__) console.log("NATIVE_SOCIAL_AUTHOR_BLOCK_OPTIMISTIC_START", { authorId: thread.userId, threadId: thread.id });
    void blockNativeSocialUser(thread.userId, accessToken)
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
        setThreads(previousThreads);
        showNotice("Unable to block user right now.");
      });
  }, [accessToken, blockThreadTarget, blockedUsers, recordFeedEvent, showNotice, threads, userId]);

  const executeBlockCommentAuthor = useCallback(() => {
    if (!blockCommentTarget || !userId) return;
    const comment = blockCommentTarget;
    const previousBlockedUsers = blockedUsers;
    const previousHiddenCommentIds = hiddenCommentIds;
    const hiddenByAuthor = Object.values(commentsByThread).flat().filter((entry) => entry.userId === comment.userId).map((entry) => entry.id);
    setBlockCommentTarget(null);
    setBlockedUsers((current) => new Set([...current, comment.userId]));
    setHiddenCommentIds((current) => new Set([...current, ...hiddenByAuthor]));
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_AUTHOR_BLOCK_OPTIMISTIC_START", { authorId: comment.userId, commentId: comment.id });
    void blockNativeSocialUser(comment.userId, accessToken)
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
  }, [accessToken, blockCommentTarget, blockedUsers, commentsByThread, hiddenCommentIds, showNotice, userId]);

  const toggleSaved = useCallback((threadId: string) => {
    if (!userId || !accessToken) {
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
    if (!userId || !accessToken) {
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
        syncCommentSupportFromRows(cached);
        setCommentsByThread((current) => ({ ...current, [targetThread.id]: cached }));
        setThreads((current) => current.map((threadItem) => (
          threadItem.id === targetThread.id && cached.length > threadItem.commentCount ? { ...threadItem, commentCount: cached.length } : threadItem
        )));
      }

      const comments = await fetchNativeSocialComments(targetThread.id, { accessToken, limit: SOCIAL_INITIAL_COMMENT_LIMIT });
      if (socialSessionKeyRef.current !== requestSessionKey) return;
      syncCommentSupportFromRows(comments);
      setCommentsByThread((current) => ({ ...current, [targetThread.id]: comments }));
      setCommentsCanLoadOlderByThread((current) => ({ ...current, [targetThread.id]: comments.length === SOCIAL_INITIAL_COMMENT_LIMIT }));
      setThreads((current) => current.map((threadItem) => (
        threadItem.id === targetThread.id && comments.length > threadItem.commentCount ? { ...threadItem, commentCount: comments.length } : threadItem
      )));
      void writeNativeSocialPersistentCache(cacheKey, comments);
    })()
      .catch(() => setCommentLoadErrors((current) => ({ ...current, [targetThread.id]: "Comments could not load. Please try again." })))
      .finally(() => {
        setCommentsLoadingThreads((current) => {
          const next = new Set(current);
          next.delete(targetThread.id);
          return next;
        });
      });
  }, [accessToken, commentsLoadingThreads, currentSessionKey, syncCommentSupportFromRows, userId]);

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
          const nextComments = mergeNativeSocialComments(current[targetThread.id] || [], older);
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, targetThread), nextComments);
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
  }, [accessToken, commentsByThread, currentSessionKey, olderCommentsLoadingThreads, syncCommentSupportFromRows, userId]);

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
          syncCommentSupportFromRows(comments);
          setCommentsByThread((current) => ({ ...current, [threadId]: comments }));
          setCommentsCanLoadOlderByThread((current) => ({ ...current, [threadId]: comments.length === SOCIAL_INITIAL_COMMENT_LIMIT }));
          setThreads((current) => current.map((thread) => (
            thread.id === threadId ? { ...thread, commentCount: comments.length } : thread
          )));
          const targetThread = threadsByIdRef.current.get(threadId);
          if (userId && targetThread) void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, targetThread), comments);
        })
        .catch(() => undefined)
        .finally(() => {
          realtimeCommentRefreshInFlightRef.current.delete(threadId);
        });
    };
    const elapsed = Date.now() - (realtimeCommentRefreshLastAtRef.current.get(threadId) || 0);
    const delay = Math.max(0, SOCIAL_REALTIME_REFRESH_COOLDOWN_MS - elapsed);
    realtimeCommentRefreshTimersRef.current.set(threadId, setTimeout(run, delay));
  }, [accessToken, currentSessionKey, syncCommentSupportFromRows, userId]);

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
    const composerAnchorCommentId = canExpandBranch
      ? item.depth === 1
        ? tree.getLastDescendantId(item.comment.id)
        : tree.getLastChildId(item.comment.id)
      : item.comment.id;
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: Math.max(1, MAX_COMPOSER_MEDIA - replyMedia.length),
    });
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
  }, [queueCommentSnap, replyComposerAnchorCommentId, replyFor, replyMedia.length]);

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
    if (parentComment && await areNativeSocialUsersBlocked(userId, parentComment.userId, accessToken)) return showNotice("You cannot reply to this user.");
    if (await areNativeSocialUsersBlocked(userId, thread.userId, accessToken)) return showNotice("You cannot reply to this user.");
    replySubmitLocksRef.current.add(submitFlightKey);
    setReplySubmittingByThread((current) => new Set([...current, thread.id]));
    const uploadedReplyImageUrls: string[] = [];
    const previousEditingComment = editingComment;
    const previousEditingComments = previousEditingComment ? commentsByThread[previousEditingComment.threadId] || [] : [];
    const optimisticId = previousEditingComment?.comment.id || `pending:comment:${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticImages = replyMedia.filter((item) => item.kind === "image").map((item) => item.uri).filter(Boolean);
    const optimisticComment: NativeSocialComment = {
      id: optimisticId,
      threadId: thread.id,
      parentCommentId: submittedParentCommentId,
      content,
      images: previousEditingComment ? previousEditingComment.comment.images : optimisticImages,
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
    setCommentsByThread((current) => {
      const existing = current[thread.id] || [];
      const nextComments = previousEditingComment
        ? existing.map((comment) => comment.id === previousEditingComment.comment.id ? optimisticComment : comment)
        : [...existing, optimisticComment];
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
        await updateNativeSocialComment(editingComment.comment.id, userId, content, accessToken);
        await replaceNativeSocialReplyMentions(editingComment.comment.id, mentions, accessToken);
        setCommentsByThread((current) => {
          const nextComments = (current[editingComment.threadId] || []).map((comment) => (
            comment.id === editingComment.comment.id ? { ...comment, content, mentions, localStatus: undefined } : comment
          ));
          const targetThread = threads.find((thread) => thread.id === editingComment.threadId);
          if (targetThread) void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, targetThread), nextComments);
          return { ...current, [editingComment.threadId]: nextComments };
        });
        showNotice("Reply updated.");
        clearReplyComposer();
        return;
      }
      for (const media of replyMedia.filter((item) => item.kind === "image")) {
        uploadedReplyImageUrls.push(await uploadNativeSocialImage(userId, media, "reply", accessToken));
      }
      const id = await createNativeSocialComment({ accessToken, content, images: uploadedReplyImageUrls, parentCommentId: submittedParentCommentId, threadId: thread.id, userId });
      if (!id) throw new Error("Unable to post reply.");
      let mentions = await resolveNativeSocialMentionsFromText(content, accessToken);
      try {
        if (mentions.length > 0) {
          await persistNativeSocialReplyMentions(id, mentions, accessToken);
          await createNativeSocialMentionNotifications(thread.id, userId, mentions.map((entry) => entry.mentionedUserId), accessToken);
        }
      } catch {
        mentions = [];
        showNotice("Reply posted, but mention syncing failed.");
      }
      const profile = userId ? await fetchNativeProfileSummary(userId, { force: false, accessToken }) : null;
      const actorName = profile?.profile?.display_name || "Someone";
      if (thread.userId && thread.userId !== userId) {
        await upsertNativeSocialNotificationWindow({
          actorId: userId,
          actorName,
          category: "social",
          href: `/social?focus=${thread.id}`,
          kind: "comment",
          ownerUserId: thread.userId,
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
          subjectId: parentComment.id,
          subjectType: "comment",
          accessToken,
        });
      }
      const optimisticCreatedAt = new Date().toISOString();
      const optimistic: NativeSocialComment = {
        id,
        threadId: thread.id,
        parentCommentId: submittedParentCommentId,
        content,
        images: uploadedReplyImageUrls,
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
        void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, thread), nextComments);
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
        const cleanupResult: NativeProtectedActionCleanupResult = await cleanupNativeSocialStorageImages(uploadedReplyImageUrls, userId, accessToken, "social_reply_orphan_upload").catch(() => "failed" as const);
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
        message: error instanceof Error ? error.message : String(error),
        threadId: thread.id,
      });
      if (previousEditingComment) {
        setCommentsByThread((current) => ({ ...current, [previousEditingComment.threadId]: previousEditingComments }));
      } else {
        setCommentsByThread((current) => ({
          ...current,
          [thread.id]: (current[thread.id] || []).map((comment) => (
            comment.id === optimisticId ? { ...comment, localStatus: "failed" as const } : comment
          )),
        }));
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: Math.max(0, item.commentCount - 1) } : item));
      }
      const quotaMessage = resolvePostingBlockedMessage(error);
      showQuotaBanner(quotaMessage || (editingComment ? "Unable to edit reply." : "Unable to post reply."));
    } finally {
      replySubmitLocksRef.current.delete(submitFlightKey);
      setReplySubmittingByThread((current) => {
        const next = new Set(current);
        next.delete(thread.id);
        return next;
      });
    }
  }, [accessToken, clearReplyComposer, commentsByThread, currentSessionKey, editingComment, openPostingRestriction, queueCommentSnap, recordFeedEvent, replyDraft, replyMedia, replySubmittingByThread, replyTargetCommentId, resolvePostingBlockedMessage, showNotice, showQuotaBanner, socialPostingBlocked, threads, userId]);

  const deleteInlineComment = useCallback((thread: NativeSocialThread, comment: NativeSocialComment) => {
    if (!userId || comment.userId !== userId) return;
    const previousComments = commentsByThread[thread.id] || [];
    setCommentsByThread((current) => ({
      ...current,
      [thread.id]: (current[thread.id] || []).filter((entry) => entry.id !== comment.id),
    }));
    setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: Math.max(0, item.commentCount - 1) } : item));
    if (replyTargetCommentId === comment.id) clearReplyComposer();
    if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_DELETE_OPTIMISTIC_START", { commentId: comment.id, threadId: thread.id });
    void deleteNativeSocialComment(comment.id, userId, accessToken)
      .then(() => {
        setCommentsByThread((current) => {
          const nextComments = (current[thread.id] || []).filter((entry) => entry.id !== comment.id);
          void purgeNativeSocialPersistentCache(userId, { commentsOnlyForThreadId: thread.id });
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, currentSessionKey, thread), nextComments);
          return { ...current, [thread.id]: nextComments };
        });
      })
      .catch((error) => {
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_DELETE_OPTIMISTIC_ROLLBACK", {
          commentId: comment.id,
          message: error instanceof Error ? error.message : String(error),
          threadId: thread.id,
        });
        setCommentsByThread((current) => ({ ...current, [thread.id]: previousComments }));
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, commentCount: item.commentCount + 1 } : item));
        showNotice("Unable to delete reply.");
      });
  }, [accessToken, clearReplyComposer, commentsByThread, currentSessionKey, replyTargetCommentId, showNotice, userId]);

  const toggleCommentSupport = useCallback((thread: NativeSocialThread, comment: NativeSocialComment) => {
    if (!userId || !accessToken) {
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
      void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), nextComments);
      return { ...current, [thread.id]: nextComments };
    });

    void setNativeSocialCommentSupport(comment.id, nextSupported, accessToken)
      .then((result) => {
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
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), nextComments);
          return { ...current, [thread.id]: nextComments };
        });
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
          void writeNativeSocialPersistentCache(nativeSocialCommentsCacheKey(userId, requestSessionKey, thread), nextComments);
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
      <View ref={threadRef}>
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
            onNavigate(item.mapId ? `/map?alert=${encodeURIComponent(item.mapId)}` : `/map?thread=${encodeURIComponent(item.id)}`);
          }}
          onOpenExternalLink={(url) => { void Linking.openURL(url); }}
          onOpenProfile={(profileUserId) => {
            recordFeedEvent(item.id, "profile_view");
            setProfileUserId(profileUserId || item.userId);
          }}
          onOpenComments={() => openThreadReplies(item)}
          onOpenMore={(event) => {
            setMoreThreadAnchor(getActionMenuAnchor(event));
            setMoreThread(item);
          }}
          onOpenShare={() => setShareThread(item)}
          onOpenSupport={() => toggleSupport(item)}
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
            onOpenProfile={setProfileUserId}
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
  }, [commentLoadErrors, commentsByThread, commentsCanLoadOlderByThread, commentsLoadingThreads, editingComment, expandedCommentBranches, expandedIds, expandedReplies, firePendingCommentSnap, handleReplyPress, hiddenCommentIds, likedCommentIds, linkPreviewByUrl, loadCommentsForThread, loadOlderCommentsForThread, olderCommentsLoadingThreads, onNavigate, openThreadReplies, pickReplyMedia, recordFeedEvent, replyComposerAnchorCommentId, replyDraft, replyFor, replyMedia, replySubmittingByThread, replyTargetCommentId, storedSets.pinned, storedSets.pinnedAt, storedSets.saved, submitReply, supportedThreadIds, togglePinned, toggleSaved, toggleSupport, toggleCommentBranch, toggleCommentSupport, userId]);

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

  const header = (
    <View>
      <View style={[styles.pullRefreshIndicator, { height: refreshing ? 30 : pullOffset > 0 ? Math.max(16, Math.min(30, pullOffset * 0.5)) : 0, opacity: refreshing || pullOffset > 0 ? 1 : 0 }]}>
        <ActivityIndicator animating={refreshing || pullOffset >= PULL_REFRESH_THRESHOLD} color={huddleColors.mutedText} size="small" />
        <Text style={styles.pullRefreshText}>{refreshing ? "Refreshing..." : pullOffset >= PULL_REFRESH_THRESHOLD ? "Release to refresh" : "Pull to refresh"}</Text>
      </View>
      <NativeSocialFilterBar
        query={query}
        selectedTags={selectedTags}
        sortMode={sortMode}
        onClearTags={() => setSelectedTags([])}
        onQueryChange={setQuery}
        onSortChange={setSortMode}
        onToggleTag={(tag) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}
      />
    </View>
  );

  const handleFeedScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawOffset = event.nativeEvent.contentOffset.y;
    const currentOffset = Math.max(0, rawOffset);
    if (rawOffset < 0 && !refreshing) setPullOffset(Math.min(Math.abs(rawOffset), 64));
    else if (pullOffset !== 0 && !refreshing) setPullOffset(0);

    const isScrollable = event.nativeEvent.contentSize.height > event.nativeEvent.layoutMeasurement.height + 8;
    if (!isScrollable) {
      setHideComposeFab(false);
      lastScrollOffsetRef.current = currentOffset;
      return;
    }
    const distanceToBottom = event.nativeEvent.contentSize.height - currentOffset - event.nativeEvent.layoutMeasurement.height;
    const maxScrollDistance = Math.max(0, event.nativeEvent.contentSize.height - event.nativeEvent.layoutMeasurement.height);
    const isShortFeed = maxScrollDistance <= 220;
    const isScrollingUp = currentOffset < lastScrollOffsetRef.current - 4;
    const isNearTop = currentOffset <= 24;
    if (isShortFeed || isScrollingUp || isNearTop) {
      setHideComposeFab(false);
    } else {
      setHideComposeFab(distanceToBottom < 220);
    }
    lastScrollOffsetRef.current = currentOffset;
  }, [pullOffset, refreshing]);

  return (
    <View style={styles.root}>
      {loading && threads.length === 0 ? (
        <NativeLoadingState />
      ) : error ? (
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
          <FlatList
            ref={listRef}
            alwaysBounceVertical
            bounces
            contentContainerStyle={styles.listContent}
            data={visibleThreads}
            extraData={{ expandedIds, pinned: storedSets.pinned, pinnedAt: storedSets.pinnedAt, saved: storedSets.saved, supportedThreadIds }}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<NativeSocialEmptyState />}
            ListFooterComponent={loadingMore ? <NativeLoadingState variant="inline" /> : null}
            ListHeaderComponent={header}
            onEndReached={() => void load("more")}
            onEndReachedThreshold={0.3}
            refreshControl={<RefreshControl enabled refreshing={refreshing} onRefresh={() => { haptic.selectTab(); void load("refresh"); }} tintColor={huddleColors.blue} colors={[huddleColors.blue]} progressViewOffset={huddleSocial.feedTopInset} />}
            onScroll={handleFeedScroll}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                animated: true,
                offset: Math.max(0, info.averageItemLength * info.index - huddleSocial.commentComposerSnapOffset),
              });
            }}
            onViewableItemsChanged={handleViewableItemsChanged}
            renderItem={renderItem}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.list}
            viewabilityConfig={viewabilityConfigRef.current}
          />
        </View>
      )}

      <Animated.View pointerEvents={hideComposeFab ? "none" : "auto"} style={[styles.composeFabWrap, { opacity: hideComposeFab ? 0 : 1, transform: [{ translateY: composeFabTranslateYRef.current }] }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Compose post" onPress={() => { if (socialPostingBlocked) { haptic.warning(); openPostingRestriction(); } else { haptic.primaryConfirm(); setEditingThread(null); setComposerOpen(true); } }} style={({ pressed }) => [styles.composeFab, pressed ? styles.composeFabPressed : null]}>
          <Feather color={huddleColors.iconMuted} name="edit-3" size={huddleType.h3} />
        </Pressable>
      </Animated.View>
      {notice ? <View pointerEvents="none" style={styles.noticeToast}><Text style={styles.noticeToastText}>{notice}</Text></View> : null}
      <NativeSocialComposerModal accessToken={accessToken} currentUserId={userId} editingThread={editingThread} isGoldUser={isGoldUser} linkPreviewByUrl={linkPreviewByUrl} open={composerOpen} onClose={closeComposer} onSubmit={submitComposer} />
      <NativeSocialMoreModal anchor={moreThreadAnchor} currentUserId={userId} open={Boolean(moreThread)} thread={moreThread} onBlock={confirmBlockThreadAuthor} onClose={() => { setMoreThread(null); setMoreThreadAnchor(null); }} onDelete={confirmDeleteThread} onEdit={(thread) => { setMoreThread(null); setMoreThreadAnchor(null); setEditingThread(thread); setComposerOpen(true); }} onHide={(thread) => { setHiddenThreadIds((current) => new Set([...current, thread.id])); recordFeedEvent(thread.id, "hide"); setMoreThread(null); setMoreThreadAnchor(null); }} onReport={(thread) => { setReportThread(thread); setMoreThread(null); setMoreThreadAnchor(null); }} />
      <NativeSocialShareModal accessToken={accessToken} currentUserId={userId} open={Boolean(shareThread)} thread={shareThread} onClose={() => setShareThread(null)} onNativeShare={openNativeShare} onNotice={showNotice} onShared={(threadId, count) => { recordFeedEvent(threadId, "share"); setThreads((current) => current.map((item) => item.id === threadId ? { ...item, shareCount: count ?? item.shareCount + 1 } : item)); }} />
      <NativeSocialReportModal accessToken={accessToken} currentUserId={userId} open={Boolean(reportThread)} target={reportThread} onClose={() => setReportThread(null)} onNotice={showNotice} onSubmitStart={() => {
        const targetId = reportThread?.id;
        if (!targetId) return;
        const previousHiddenThreadIds = hiddenThreadIds;
        socialReportRollbackRef.current = () => setHiddenThreadIds(previousHiddenThreadIds);
        setHiddenThreadIds((current) => new Set([...current, targetId]));
        if (__DEV__) console.log("NATIVE_SOCIAL_POST_REPORT_OPTIMISTIC_START", { threadId: targetId });
      }} onSubmitFailure={() => {
        socialReportRollbackRef.current?.();
        socialReportRollbackRef.current = null;
        if (__DEV__) console.warn("NATIVE_SOCIAL_POST_REPORT_OPTIMISTIC_ROLLBACK", { threadId: reportThread?.id || null });
      }} onSubmitSuccess={() => {
        socialReportRollbackRef.current = null;
        if (userId) void purgeNativeSocialPersistentCache(userId);
        if (reportThread) setThreads((current) => current.filter((thread) => thread.id !== reportThread.id));
      }} />
      <NativeSocialReportModal accessToken={accessToken} currentUserId={userId} open={Boolean(commentReportTarget)} target={commentReportTarget ? { userId: commentReportTarget.userId, author: commentReportTarget.author } : null} onClose={() => setCommentReportTarget(null)} onNotice={showNotice} onSubmitStart={() => {
        const targetId = commentReportTarget?.id;
        if (!targetId) return;
        const previousHiddenCommentIds = hiddenCommentIds;
        socialReportRollbackRef.current = () => setHiddenCommentIds(previousHiddenCommentIds);
        setHiddenCommentIds((current) => new Set([...current, targetId]));
        if (__DEV__) console.log("NATIVE_SOCIAL_COMMENT_REPORT_OPTIMISTIC_START", { commentId: targetId });
      }} onSubmitFailure={() => {
        socialReportRollbackRef.current?.();
        socialReportRollbackRef.current = null;
        if (__DEV__) console.warn("NATIVE_SOCIAL_COMMENT_REPORT_OPTIMISTIC_ROLLBACK", { commentId: commentReportTarget?.id || null });
      }} onSubmitSuccess={() => {
        socialReportRollbackRef.current = null;
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
        actionLabel="See plans"
        body={quotaModalMessage}
        open={Boolean(quotaModalMessage)}
        title="Posting limit reached"
        onAction={() => {
          setQuotaModalMessage("");
          onNavigate("/premium");
        }}
        onClose={() => setQuotaModalMessage("")}
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
        currentUserId={userId}
        sessionKey={sessionKey}
        onClose={() => setProfileUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(profileUserId)}
        userId={profileUserId}
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
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: suggestion.avatarUrl }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} />
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
  onOpenProfile: (userId: string) => void;
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
  const replyFirstUrl = extractNativeSocialFirstHttpUrl(replyDraft);
  const displayedReplyDraft = replyFirstUrl ? replyDraft.replace(replyFirstUrl, "").trim() : replyDraft;
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
        <View pointerEvents="none" style={styles.replyComposerTextLayerWrap}>
          <Text style={styles.replyComposerTextLayer}>
            {displayedReplyDraft ? renderReplyComposerLayer(displayedReplyDraft) : <Text style={styles.replyComposerPlaceholderText}>Leave a comment</Text>}
          </Text>
        </View>
        <NativeSocialReplyComposerInput
          ref={replyInputRef}
          onBlur={() => setTimeout(() => setMentionQuery(null), 120)}
          onChangeText={(value) => {
            const nextValue = replyFirstUrl ? `${value.trimEnd()} ${replyFirstUrl}`.trim() : value;
            onUpdateReplyDraft(nextValue);
            setMentionQuery(findNativeActiveMentionQuery(nextValue, value.length));
          }}
          style={styles.replyComposerInput}
          onSelectionChange={(event) => setMentionQuery(findNativeActiveMentionQuery(replyDraft, event.nativeEvent.selection.start))}
          placeholder=""
          value={displayedReplyDraft}
        />
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
        {replyFirstUrl ? (
          <NativeSocialExternalLinkPreview
            linkPreview={linkPreviewByUrl[replyFirstUrl] || null}
            onOpen={(url) => void Linking.openURL(url)}
            url={replyFirstUrl}
          />
        ) : null}
        <View style={styles.replyComposerControls}>
          <Pressable accessibilityRole="button" disabled={Boolean(editingComment)} onPress={onPickReplyMedia} style={({ pressed }) => [styles.replyComposerIconButton, editingComment ? styles.disabled : null, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.iconMuted} name="image" size={huddleSocial.actionIconSize} />
          </Pressable>
          {remainingReplyWords < 0 ? <Text style={styles.wordCounterError}>{remainingReplyWords}</Text> : null}
          <Pressable accessibilityRole="button" disabled={replySubmitting || !replyDraft.trim() || remainingReplyWords < 0} onPress={onSubmitReply} style={({ pressed }) => [styles.replySendButton, replySubmitting || !replyDraft.trim() || remainingReplyWords < 0 ? styles.replySendButtonDisabled : null, pressed ? styles.pressed : null]}>
            {replySubmitting ? <ActivityIndicator color={huddleColors.iconMuted} /> : <Feather color={replySubmitting || !replyDraft.trim() || remainingReplyWords < 0 ? huddleColors.iconSubtle : huddleColors.onPrimary} name="arrow-up" size={huddleSocial.actionIconSize} />}
          </Pressable>
        </View>
      </View>
      {replyMedia.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.replyMediaRow}>
          {replyMedia.map((media, index) => (
            <View key={`${media.uri}-${index}`} style={[styles.mediaThumbWrap, { aspectRatio: composerMediaPreviewAspect(media) }]}>
              <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: media.uri }} style={styles.mediaThumb as ImageStyle} transition={120} />
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
      {!loading && !error && tree.threadedComments.length === 0 && !activeComposer ? <Text style={styles.emptyCommentText}>No replies yet.</Text> : null}
      {!loading && !error && canLoadOlder ? (
        <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={onLoadOlder} style={({ pressed }) => [styles.inlineReplyState, pressed ? styles.pressed : null]}>
          {loadingOlder ? <ActivityIndicator color={huddleColors.blue} /> : <Text style={styles.commentActionText}>Load older replies</Text>}
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
              <Pressable accessibilityRole="button" onPress={() => onOpenProfile(comment.userId)} style={styles.commentAvatar}>
                {comment.author.avatarUrl ? <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" source={{ uri: comment.author.avatarUrl }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} /> : <Text style={styles.commentAvatarText}>{(comment.author.socialId || comment.author.displayName || "U").charAt(0).toUpperCase()}</Text>}
              </Pressable>
              <View style={styles.commentBody}>
                <View style={styles.commentHeader}>
                  <Text numberOfLines={1} style={styles.commentAuthor}>{comment.author.socialId || comment.author.displayName || "User"}</Text>
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
                    onOpen={(url) => void Linking.openURL(url)}
                    url={commentPreviewUrl}
                  />
                ) : null}
                {comment.images.length > 0 ? <NativeSocialCommentMediaCarousel images={comment.images} /> : null}
                {comment.localStatus || isPendingSocialId(comment.id) ? (
                  <Text style={styles.commentStatusText}>{comment.localStatus === "failed" ? "Could not post" : "Posting..."}</Text>
                ) : null}
                <View style={styles.commentIconActions}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: likedCommentIds.has(comment.id) }} hitSlop={huddleSpacing.x2} onPress={() => onLikeComment(comment)} style={({ pressed }) => [styles.commentIconButton, likedCommentIds.has(comment.id) ? styles.commentIconButtonActive : null, pressed ? styles.pressed : null]}>
                    <Ionicons color={likedCommentIds.has(comment.id) ? huddleColors.blue : huddleColors.iconMuted} name="paw-outline" size={huddleSocial.actionIconSize} />
                    {comment.supportCount > 0 ? <View style={styles.commentActionBadge}><Text style={styles.commentActionBadgeText}>{comment.supportCount}</Text></View> : null}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={canExpandBranch ? `${branchExpanded ? "Hide" : "View"} ${replyBadgeCount} ${replyBadgeCount === 1 ? "reply" : "replies"} and reply` : "Reply to comment"} hitSlop={huddleSpacing.x2} onPress={() => onReplyPress(item)} style={({ pressed }) => [styles.commentIconButton, replyFor === thread.id && replyTargetCommentId === comment.id ? styles.commentIconButtonActive : null, pressed ? styles.pressed : null]}>
                    <Feather color={replyFor === thread.id && replyTargetCommentId === comment.id ? huddleColors.blue : huddleColors.iconMuted} name="message-circle" size={huddleSocial.actionIconSize} />
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
  currentUserId,
  editingThread,
  isGoldUser,
  linkPreviewByUrl,
  onClose,
  onSubmit,
  open,
}: {
  accessToken?: string | null;
  currentUserId: string | null;
  editingThread: NativeSocialThread | null;
  isGoldUser: boolean;
  linkPreviewByUrl: Record<string, NativeSocialLinkPreview>;
  onClose: () => void;
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
  const [composerShakeAnim, triggerComposerShake] = useShakeAnimation();
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
  const wordsUsed = countWords(content);
  const contentFirstUrl = extractNativeSocialFirstHttpUrl(content);
  const displayedContent = contentFirstUrl ? content.replace(contentFirstUrl, "").trim() : content;
  const uploadProgress = useMemo(() => {
    const imageMedia = media.filter((item) => item.kind === "image");
    if (imageMedia.length === 0) return null;
    const uploaded = imageMedia.filter((item) => item.status === "uploaded").length;
    const uploading = imageMedia.some((item) => item.status === "uploading" || item.status === "queued");
    return uploading ? Math.round((uploaded / imageMedia.length) * 100) : null;
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

  const pickMedia = useCallback(async () => {
    if (!currentUserId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: editingThread?.providerVideoId ? ["images"] : ["images", "videos"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: Math.max(1, MAX_COMPOSER_MEDIA - media.length),
    });
    if (result.canceled) return;
    const hasExistingVideo = media.some((item) => item.kind === "video");
    const accepted: NativeSocialComposerUploadMedia[] = [];
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
      if (item.kind === "video" && !isGoldUser) continue;
      if (item.kind === "video" && (hasExistingVideo || accepted.some((next) => next.kind === "video"))) continue;
      if (item.kind === "video" && Number(item.durationSeconds ?? 0) > 15.5) continue;
      accepted.push({ ...item, status: item.kind === "image" ? "queued" : "uploaded", uploadedUrl: null });
    }
    setMedia((current) => [...current, ...accepted].slice(0, MAX_COMPOSER_MEDIA));
    if (lastFocusedComposerFieldRef.current) {
      setTimeout(() => scrollComposerFieldIntoView(lastFocusedComposerFieldRef.current as "category" | "title" | "content"), 220);
    }
    const uploadItems = accepted.filter((item) => item.kind === "image");
    const uploadOne = async (item: NativeSocialComposerUploadMedia) => {
      setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, status: "uploading", error: null } : entry));
      try {
        const uploadedUrl = await uploadNativeSocialImage(currentUserId, item, "thread", accessToken);
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, status: "uploaded", uploadedUrl, error: null } : entry));
      } catch (error) {
        logNativeProtectedActionFailure("[native.social] upload_media_failed", error);
        const message = error instanceof Error ? error.message : "Image upload failed";
        setMedia((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, status: "error", uploadedUrl: null, error: message } : entry));
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
  }, [accessToken, currentUserId, editingThread, isGoldUser, media, scrollComposerFieldIntoView]);

  const submit = useCallback(() => {
    if (submittingRef.current || submitting) return;
    if (media.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "error")) return;
    // Broadcast-style validation: slide is always enabled. On commit, validate; if invalid, mark fields red + scroll to first missing + reset slider + shake.
    const nextErrors = { title: !title.trim(), content: !content.trim() };
    setComposerValidationErrors(nextErrors);
    if (nextErrors.title || nextErrors.content) {
      haptic.error();
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
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close composer" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="autoMax" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={styles.sheetTitle}>{editingThread ? "Edit post" : "Create post"}</Text>
            <AppModalCloseButton onPress={onClose} />
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
                <Text style={styles.composerMentionTextLayer}>
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
                    const nextValue = contentFirstUrl ? `${value.trimEnd()} ${contentFirstUrl}`.trim() : value;
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
            {contentFirstUrl ? (
              <NativeSocialExternalLinkPreview
                linkPreview={linkPreviewByUrl[contentFirstUrl] || null}
                onOpen={(url) => void Linking.openURL(url)}
                url={contentFirstUrl}
              />
            ) : null}
            <View style={styles.mediaPickerBlock}>
              {media.length > 0 ? (
                <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.mediaRailViewport} contentContainerStyle={styles.mediaThumbRow}>
                  {media.map((item, index) => (
                    <View key={`${item.uri}-${index}`} style={[styles.mediaThumbWrap, { aspectRatio: composerMediaPreviewAspect(item) }]}>
                      {item.kind === "image" ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: item.uri }} style={styles.mediaThumb} transition={120} /> : <View style={styles.videoThumb}><Feather color={huddleColors.onPrimary} name="play" size={22} /></View>}
                      {item.status === "uploading" && uploadProgress !== null && item.kind === "image" ? (
                        <View pointerEvents="none" style={styles.mediaUploadingOverlay}>
                          <ActivityIndicator color={huddleColors.onPrimary} size="small" />
                          <Text style={styles.mediaUploadingText}>Uploading {uploadProgress}%</Text>
                        </View>
                      ) : null}
                      <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => setMedia((current) => current.filter((_, idx) => idx !== index))} style={styles.mediaRemoveButton}><Feather color={huddleColors.onPrimary} name="x" size={14} /></Pressable>
                    </View>
                  ))}
                </ScrollView>
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
                <Feather color={huddleColors.mutedText} name="camera" size={huddleSocial.actionIconSize} />
              </Pressable>
              <Animated.View style={{ flex: 1, transform: [{ translateX: composerShakeAnim }] }}>
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
  const [selectedKey, setSelectedKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !currentUserId) {
      setTargets([]);
      return;
    }
    setLoading(true);
    setSearchQuery("");
    void fetchNativeSocialShareTargets(currentUserId, accessToken)
      .then((nextTargets) => {
        setTargets(nextTargets);
        setSelectedKey(nextTargets[0]?.chatId || "");
      })
      .catch(() => onNotice("Unable to load chats right now."))
      .finally(() => setLoading(false));
  }, [accessToken, currentUserId, onNotice, open]);

  const selectedTarget = targets.find((target) => target.chatId === selectedKey) || null;
  const filteredTargets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target) => `${target.label} ${target.subtitle || ""}`.toLowerCase().includes(q));
  }, [searchQuery, targets]);
  const shareToChat = useCallback(() => {
    if (!thread || !currentUserId || !selectedTarget || sending) return;
    setSending(true);
    void sendNativeSocialShareToChat(thread, selectedTarget, currentUserId, accessToken)
      .then(async () => {
        const count = await recordNativeSocialShare(thread.id, accessToken);
        onShared(thread.id, count);
        onNotice(`Shared to ${selectedTarget.label}.`);
        onClose();
      })
      .catch(() => onNotice("Unable to share to Huddle Chats."))
      .finally(() => setSending(false));
  }, [accessToken, currentUserId, onClose, onNotice, onShared, selectedTarget, sending, thread]);

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
          <View style={styles.sheetContent}>
            <View style={styles.shareSearchField}>
              <Feather color={huddleColors.iconSubtle} name="search" size={huddleSocial.actionIconSize} />
              <TextInput
                accessibilityLabel="Search share targets"
                autoCorrect={false}
                onChangeText={setSearchQuery}
                placeholder="Search User name or Social ID"
                placeholderTextColor={huddleColors.mutedText}
                style={styles.shareSearchInput}
                value={searchQuery}
              />
            </View>
            <View style={styles.shareTargetsBlock}>
              {loading ? <NativeLoadingState variant="inline" /> : filteredTargets.length === 0 ? <Text style={styles.emptyCommentText}>No chats found.</Text> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shareTargetRow}>
                  {filteredTargets.map((target) => {
                    const selected = target.chatId === selectedKey;
                    return (
                      <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedKey(target.chatId)} style={({ pressed }) => [styles.shareTarget, pressed ? styles.pressed : null]}>
                        <View style={[styles.shareTargetAvatar, selected ? styles.shareTargetAvatarSelected : null]}>
                          {target.avatarUrl ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: target.avatarUrl }} style={styles.shareTargetAvatarImage as ImageStyle} transition={120} /> : <Text style={styles.shareTargetInitial}>{target.label.charAt(0).toUpperCase()}</Text>}
                        </View>
                        <Text numberOfLines={1} style={styles.shareTargetName}>{target.label}</Text>
                        <Text numberOfLines={1} style={styles.shareTargetSubtitle}>{target.subtitle || "Chat"}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
            <View style={styles.shareActionRow}>
              <Pressable accessibilityRole="button" disabled={!selectedTarget || sending || loading} onPress={shareToChat} style={({ pressed }) => [styles.secondaryButton, !selectedTarget || sending || loading ? styles.disabled : null, pressed ? styles.pressed : null]}>
                {sending ? <ActivityIndicator color={huddleColors.blue} /> : <Feather color={huddleColors.blue} name="send" size={18} />}
                <Text style={styles.secondaryButtonText}>Huddle Chats</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { void onNativeShare(thread).then(onClose); }} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
                <Feather color={huddleColors.blue} name="share-2" size={18} />
                <Text style={styles.secondaryButtonText}>Share</Text>
              </Pressable>
            </View>
          </View>
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
    backgroundColor: huddleColors.primarySoftFill,
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
  commentIconButtonActive: {
    backgroundColor: huddleColors.primarySoftFill,
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
    minHeight: huddleLayout.fieldHeight * 2,
    position: "relative",
  },
  composerMentionInput: {
    color: "transparent",
    fontFamily: "Urbanist-500",
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 20,
    minHeight: huddleLayout.fieldHeight * 2,
    paddingHorizontal: 0,
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
    minHeight: huddleLayout.fieldHeight * 2,
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
    height: huddleLayout.fieldHeight - 2,
    padding: 0,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: huddleFormFields.valueLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
  },
  composerPlainTextArea: {
    minHeight: huddleLayout.fieldHeight * 2,
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
    right: huddleSpacing.x5,
    width: huddleSocial.composeFabSize,
    zIndex: 30,
    elevation: 30,
  },
  composeFabPressed: {
    ...huddleButtons.pressed,
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
    alignItems: "center",
    backgroundColor: huddleColors.divider,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: huddleLayout.navHeight + huddleSpacing.x8,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSocial.feedTopInset,
  },
  mediaPickerBlock: {
    gap: huddleSpacing.x3,
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
  noticeToast: {
    alignSelf: "center",
    backgroundColor: huddleColors.text,
    borderRadius: huddleRadii.pill,
    bottom: huddleLayout.navHeight + huddleSpacing.x9,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
    position: "absolute",
  },
  noticeToastText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  pressed: {
    opacity: 0.76,
  },
  pullRefreshIndicator: {
    alignItems: "center",
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "center",
    overflow: "hidden",
  },
  pullRefreshText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
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
  replyComposerTextLayerWrap: {
    bottom: huddleSpacing.x2,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  replyComposerTextLayer: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x2,
  },
  replyComposerInput: {
    backgroundColor: "transparent",
    color: "transparent",
    includeFontPadding: false,
    textShadowColor: "transparent",
    textShadowRadius: 0,
    zIndex: 3,
  },
  replyComposerPlaceholderText: {
    color: huddleColors.caption,
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
    alignItems: "center",
    backgroundColor: huddleColors.primarySoftFill,
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
  shareSearchField: {
    alignItems: "center",
    backgroundColor: huddleColors.canvas,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    minHeight: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x3,
  },
  shareSearchInput: {
    color: huddleColors.text,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    minHeight: huddleLayout.fieldHeight - huddleSpacing.x2,
    padding: 0,
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
    paddingRight: huddleSpacing.x1,
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
    minHeight: huddleSpacing.x10 + huddleSpacing.x8,
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
