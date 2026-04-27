import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode, type RefObject } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
  X,
  Image,
  Search,
  Loader2,
  MessageSquare,
  Heart,
  MessageCircle,
  Send,
  ArrowUp,
  Pin,
  ThumbsUp,
  Flag,
  EyeOff,
  Ban,
  MoreHorizontal,
  Bookmark,
  Pencil,
  Trash2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NeuButton } from "@/components/ui/NeuButton";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { resolveCopy } from "@/lib/copy";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
// browser-image-compression is dynamically imported inside prepareComposerMedia
// so the ~50 KB lib stays out of the initial Social bundle.
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { MediaThumb } from "@/components/media/MediaThumb";
import { areUsersBlocked, loadBlockedUserIdsFor } from "@/lib/blocking";
import { PostMediaCarousel } from "@/components/social/PostMediaCarousel";
import { quotaConfig } from "@/config/quotaConfig";
import { buildShareModel, type ShareModel } from "@/lib/shareModel";
import { detectSensitiveImage } from "@/lib/sensitiveContent";
import {
  SOCIAL_VIDEO_MAX_SECONDS,
  attachSocialVideoToThread,
  compressAndTrimVideo,
  deleteSocialVideo,
  getVideoDuration,
  uploadSocialVideoToBunny,
  type SocialVideoMetadata,
} from "@/lib/socialVideo";
import emptyChatImage from "@/assets/Notifications/Empty Chat.png";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import { NoticeBoardComposerModal } from "@/components/social/noticeboard/NoticeBoardComposerModal";
import { NoticeBoardOverlays } from "@/components/social/noticeboard/NoticeBoardOverlays";
import { ExternalLinkPreviewCard } from "@/components/ui/ExternalLinkPreviewCard";
import { stripExternalUrlFromText } from "@/lib/externalLinkPreview";
import {
  fetchFeedPage as fetchFeedPageData,
  fetchFocusedThreadRow as fetchFocusedThreadRowData,
  hydrateRows as hydrateFeedRows,
} from "@/components/social/noticeboard/feedData";
import type {
  ActiveMentionQuery,
  ComposerMedia,
  ComposerUploadState,
  FeedCursor,
  HydratedRowsResult,
  LinkPreview,
  LinkPreviewPayload,
  MentionEntry,
  MentionSuggestion,
  Thread,
  ThreadComment,
} from "@/components/social/noticeboard/types";


const tags = [
  { id: "Pets", label: "Pets" },
  { id: "Social", label: "Social" },
  { id: "Health", label: "Health" },
  { id: "News", label: "News" },
  { id: "Marketplace", label: "Marketplace" },
  { id: "Adoption", label: "Adoption" },
  { id: "Meetup", label: "Meetup" },
];

const AuthorHandle = ({
  displayName,
  socialId,
  className = "",
  socialClassName = "",
}: {
  displayName?: string | null;
  socialId?: string | null;
  className?: string;
  socialClassName?: string;
}) => (
  <span className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
    <span className="truncate font-semibold text-brandText">{displayName || "Anonymous"}</span>
    {socialId ? (
      <span className={cn("truncate text-xs font-medium text-[rgba(74,73,101,0.52)]", socialClassName)}>
        @{socialId}
      </span>
    ) : null}
  </span>
);

type StoredLinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  fetchedAt: number;
};

const LINK_PREVIEW_QUEUE_LIMIT = 3;
const LINK_PREVIEW_LRU_LIMIT = 120;
const LINK_PREVIEW_STORAGE_KEY = "noticeboard_link_preview_lru_v1";
const LINK_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const PULL_REFRESH_START_ZONE_PX = Number.POSITIVE_INFINITY;

const isLinkPreviewFresh = (value: StoredLinkPreview | null | undefined, now = Date.now()) =>
  Boolean(value && value.url && now - value.fetchedAt < LINK_PREVIEW_TTL_MS);

const loadStoredLinkPreviewMap = (): Record<string, StoredLinkPreview> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LINK_PREVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredLinkPreview>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, StoredLinkPreview> = {};
    const now = Date.now();
    Object.entries(parsed).forEach(([url, value]) => {
      if (!isLinkPreviewFresh(value, now)) return;
      next[url] = value;
    });
    return next;
  } catch {
    return {};
  }
};

const saveStoredLinkPreviewMap = (entries: Record<string, StoredLinkPreview>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LINK_PREVIEW_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage write failure
  }
};

const trimLinkPreviewState = (
  entries: Record<string, LinkPreview>,
  accessMap: Map<string, number>,
  maxEntries = LINK_PREVIEW_LRU_LIMIT,
) => {
  const keys = Object.keys(entries);
  if (keys.length <= maxEntries) return entries;
  const sorted = [...keys].sort((a, b) => (accessMap.get(b) ?? 0) - (accessMap.get(a) ?? 0));
  const keep = new Set(sorted.slice(0, maxEntries));
  const next: Record<string, LinkPreview> = {};
  keep.forEach((key) => {
    next[key] = entries[key];
  });
  keys.forEach((key) => {
    if (!keep.has(key)) accessMap.delete(key);
  });
  return next;
};

type MentionSeed = MentionSuggestion & {
  score: number;
  lastSeenAt?: number;
};

interface NoticeBoardProps {
  onPremiumClick: () => void;
  composeSignal: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
}

type SocialFeedEventType =
  | "impression"
  | "dwell_10s"
  | "expand_post"
  | "open_comments"
  | "profile_view"
  | "like"
  | "comment"
  | "save"
  | "share"
  | "hide"
  | "block";

const MAX_COMPOSER_WORDS = 500;
const MAX_COMPOSER_MEDIA = 10;
const MENTION_LIVE_SUGGESTIONS_ENABLED = true;

const getNoticeMediaItems = (notice: Thread) => {
  const images = (notice.images || [])
    .filter((src): src is string => typeof src === "string" && src.trim().length > 0)
    .map((src, index) => ({
      src,
      alt: `${notice.title || "Post"} ${index + 1}`,
      kind: "image" as const,
    }));
  if (notice.video_provider !== "bunny_stream" || !notice.provider_video_id) return images;
  return [
    ...images,
    {
      src: notice.video_playback_url || notice.video_embed_url || notice.provider_video_id,
      alt: `${notice.title || "Post"} video`,
      kind: "video" as const,
      poster: notice.video_thumbnail_url || notice.video_preview_url || null,
      previewSrc: notice.video_preview_url || null,
      embedUrl: notice.video_embed_url || null,
      status: notice.video_status || null,
    },
  ];
};

const countWords = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const findNearestScrollableAncestor = (element: HTMLElement | null) => {
  let current = element?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY || "") && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const msg = record.message ?? record.error_description ?? record.hint ?? record.code;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
};

const parseAlertTypeFromTitle = (title: string) => {
  const normalized = title.match(/^\s*(stray|lost|caution|others)\s+alert\b/i)?.[1]?.toLowerCase();
  if (normalized === "lost") return "Lost" as const;
  if (normalized === "stray") return "Stray" as const;
  if (normalized === "caution") return "Caution" as const;
  if (normalized === "others") return "Others" as const;
  return null;
};

const deriveDistrictLabel = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
};

const deriveAlertTypeFromNoticeData = (notice: Pick<Thread, "alert_type" | "tags" | "title">) => {
  if (notice.alert_type) {
    const normalized = String(notice.alert_type).toLowerCase();
    if (normalized === "lost") return "Lost" as const;
    if (normalized === "stray") return "Stray" as const;
    if (normalized === "caution") return "Caution" as const;
    return "Others" as const;
  }

  const tags = (notice.tags || []).map((tag) => String(tag).toLowerCase());
  if (tags.includes("lost")) return "Lost" as const;
  if (tags.includes("stray")) return "Stray" as const;
  if (tags.includes("caution")) return "Caution" as const;
  if (tags.includes("others")) return "Others" as const;

  return parseAlertTypeFromTitle(notice.title);
};

const isVideoFile = (file: File) => file.type.startsWith("video/");

const extractMentionKeys = (value: string) =>
  Array.from(
    new Set(
      (value.match(/@([A-Za-z0-9_.-]{2,24})/g) || [])
        .map((raw) => raw.slice(1).trim().toLowerCase())
        .filter(Boolean)
    )
  );

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const formatInlineMarkup = (value: string) => {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
};

const mentionTokenMatcher = /@([A-Za-z0-9_.-]{2,24})\b/g;
const urlMatcher = /\bhttps?:\/\/[^\s<>"')]+/gi;

const normalizeHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const extractFirstHttpUrl = (value: string) => {
  if (!value) return null;
  const match = value.match(urlMatcher);
  if (!match || match.length === 0) return null;
  const trimmedCandidate = match[0].replace(/[|.,!?;:)\]]+$/g, "");
  return normalizeHttpUrl(trimmedCandidate);
};

const formatUrlLabel = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const compact = `${host}${path}`.replace(/\/+$/, "");
    if (compact.length <= 44) return compact;
    return `${compact.slice(0, 41)}...`;
  } catch {
    if (url.length <= 44) return url;
    return `${url.slice(0, 41)}...`;
  }
};

const parseYouTubeVideoId = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return id.trim() || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v") || "";
        return id.trim() || null;
      }
      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/").filter(Boolean)[1] || "";
        return id.trim() || null;
      }
    }
  } catch {
    return null;
  }
  return null;
};

const buildIntrinsicLinkPreview = (url: string): LinkPreview | null => {
  const youtubeId = parseYouTubeVideoId(url);
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

const buildFallbackLinkPreview = (url: string, error?: string): LinkPreview => {
  const intrinsic = buildIntrinsicLinkPreview(url);
  if (intrinsic) {
    return {
      ...intrinsic,
      error,
    };
  }
  const label = formatUrlLabel(url);
  try {
    const parsed = new URL(url);
    return {
      url,
      title: label,
      description: undefined,
      image: undefined,
      siteName: parsed.hostname.replace(/^www\./, "") || "External link",
      loading: false,
      failed: false,
      resolved: true,
      error,
    };
  } catch {
    return {
      url,
      title: label,
      description: undefined,
      image: undefined,
      siteName: "External link",
      loading: false,
      failed: false,
      resolved: true,
      error,
    };
  }
};

const findMentionOccurrences = (value: string, socialId: string) => {
  const matches: Array<{ start: number; end: number }> = [];
  if (!socialId) return matches;
  const matcher = new RegExp(`@${socialId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  let found: RegExpExecArray | null;
  while ((found = matcher.exec(value)) !== null) {
    matches.push({ start: found.index, end: found.index + found[0].length });
  }
  return matches;
};

const rebaseMentionEntries = (value: string, entries: MentionEntry[]) => {
  const grouped = new Map<string, MentionEntry[]>();
  entries.forEach((entry) => {
    const key = entry.socialIdAtTime.toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  });

  const rebased: MentionEntry[] = [];
  grouped.forEach((groupEntries, key) => {
    const occurrences = findMentionOccurrences(value, key);
    groupEntries
      .sort((a, b) => a.start - b.start)
      .forEach((entry, index) => {
        const occurrence = occurrences[index];
        if (!occurrence) return;
        rebased.push({
          ...entry,
          start: occurrence.start,
          end: occurrence.end,
        });
      });
  });

  return rebased.sort((a, b) => a.start - b.start);
};

const findActiveMentionQuery = (value: string, caret: number): ActiveMentionQuery | null => {
  const prefix = value.slice(0, caret);
  const match = prefix.match(/(?:^|\s)(@([A-Za-z0-9_.-]{0,24}))$/);
  if (!match || typeof match.index !== "number") return null;
  const token = match[1] || "";
  const query = match[2] || "";
  const tokenStart = match.index + match[0].length - token.length;
  return {
    query,
    tokenStart,
    tokenEnd: caret,
    caret,
  };
};

const dedupeMentionEntries = (entries: MentionEntry[]) => {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [entry.mentionedUserId, entry.socialIdAtTime.toLowerCase(), entry.start, entry.end].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sameMentionSeedList = (a: MentionSeed[], b: MentionSeed[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      entry.userId === other.userId &&
      entry.socialId === other.socialId &&
      entry.displayName === other.displayName &&
      entry.avatarUrl === other.avatarUrl &&
      entry.score === other.score &&
      (entry.lastSeenAt || 0) === (other.lastSeenAt || 0)
    );
  });
};

const dedupeMentionSuggestions = (suggestions: MentionSuggestion[]) => {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.userId}:${suggestion.socialId.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sameMentionQuery = (a: ActiveMentionQuery | null, b: ActiveMentionQuery | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.query === b.query && a.tokenStart === b.tokenStart && a.tokenEnd === b.tokenEnd;
};

const buildFeedCursor = (thread?: Thread | null): FeedCursor | null => {
  if (!thread?.created_at || !thread?.id) return null;
  return { created_at: thread.created_at, id: thread.id, score: thread.score ?? null };
};

export const NoticeBoard = ({ onPremiumClick, composeSignal, scrollContainerRef }: NoticeBoardProps) => {
  const t = resolveCopy;
  const { user, profile } = useAuth();
  const { isActive } = useSafetyRestrictions();
  const { showUpsellBanner } = useUpsellBanner();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setScrollerEl(scrollContainerRef?.current ?? null);
  }, [scrollContainerRef]);
  const [notices, setNotices] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [pullOffset, setPullOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const lastCursorRef = useRef<FeedCursor | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [socialRestrictionModalOpen, setSocialRestrictionModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const createInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [createMentions, setCreateMentions] = useState<MentionEntry[]>([]);
  const [createMentionQuery, setCreateMentionQuery] = useState<ActiveMentionQuery | null>(null);
  const [createMentionSuggestions, setCreateMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [createComposerFocused, setCreateComposerFocused] = useState(false);
  const [category, setCategory] = useState("Social");
  const [createMediaFiles, setCreateMediaFiles] = useState<ComposerMedia[]>([]);
  const [createIsSensitive, setCreateIsSensitive] = useState(false);
  const [createSensitiveSuggested, setCreateSensitiveSuggested] = useState(false);
  const [hiddenNotices, setHiddenNotices] = useState<Set<string>>(new Set());
  const [hiddenComments, setHiddenComments] = useState<Set<string>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [confirmBlockId, setConfirmBlockId] = useState<string | null>(null);
  const [confirmBlockName, setConfirmBlockName] = useState<string>("this user");
  const [commentsByThread, setCommentsByThread] = useState<Record<string, ThreadComment[]>>({});
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyTargetCommentId, setReplyTargetCommentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyDismissedPreviewUrls, setReplyDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [replyMentions, setReplyMentions] = useState<MentionEntry[]>([]);
  const [replyMentionQuery, setReplyMentionQuery] = useState<ActiveMentionQuery | null>(null);
  const [replyMentionSuggestions, setReplyMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [replyComposerFocused, setReplyComposerFocused] = useState(false);
  const [replyMediaFiles, setReplyMediaFiles] = useState<ComposerMedia[]>([]);
  const [replyError, setReplyError] = useState("");
  const [replySubmittingByThread, setReplySubmittingByThread] = useState<Set<string>>(new Set());
  const [commentsLoadingThreads, setCommentsLoadingThreads] = useState<Set<string>>(new Set());
  const [commentLoadErrors, setCommentLoadErrors] = useState<Record<string, string>>({});
  const [composerUploadState, setComposerUploadState] = useState<ComposerUploadState>({
    scope: null,
    status: "idle",
    progress: 0,
  });
  const [newsAlertTypeByThread, setNewsAlertTypeByThread] = useState<Record<string, "Stray" | "Lost" | "Caution" | "Others">>({});
  const [createErrors, setCreateErrors] = useState<{ title?: string; content?: string }>({});
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  // SPRINT 3: Track liked notices for green (#22c55e) button state
  const [likedNotices, setLikedNotices] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilters, setTopicFilters] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"" | "Trending" | "Latest" | "Saves">("Latest");
  const noticesRef = useRef<Thread[]>([]);
  const commentsByThreadRef = useRef<Record<string, ThreadComment[]>>({});
  const filtersRowRef = useRef<HTMLDivElement | null>(null);
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const commentPanelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const replyComposerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const feedSessionIdRef = useRef<string>(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `feed-${Date.now()}`);
  const trackedImpressionsRef = useRef<Set<string>>(new Set());
  const trackedDwellRef = useRef<Set<string>>(new Set());
  const dwellTimeoutsRef = useRef<Map<string, number>>(new Map());
  const lastAutoFocusedThreadRef = useRef<string | null>(null);
  const focusFallbackShownRef = useRef<string | null>(null);
  const feedRequestTokenRef = useRef(0);
  const focusThreadId = params.threadId || searchParams.get("focus") || searchParams.get("thread");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileFallbackName, setProfileFallbackName] = useState("");
  const [threadMentionsById, setThreadMentionsById] = useState<Record<string, MentionEntry[]>>({});
  const [replyMentionsById, setReplyMentionsById] = useState<Record<string, MentionEntry[]>>({});
  const [mentionDirectory, setMentionDirectory] = useState<Record<string, MentionSuggestion>>({});
  const mentionDirectoryRef = useRef<Record<string, MentionSuggestion>>({});
  const [mentionSeeds, setMentionSeeds] = useState<MentionSeed[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareModel | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null);
  const [reportTargetName, setReportTargetName] = useState<string>("");
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState<Record<string, LinkPreview>>({});
  const [expandedContentIds, setExpandedContentIds] = useState<Set<string>>(new Set());
  const [expandableContentById, setExpandableContentById] = useState<Record<string, boolean>>({});
  const pullTouchStartYRef = useRef<number | null>(null);
  const pullTouchEligibleRef = useRef(false);
  const pullTriggeredRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const contentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const linkPreviewMapRef = useRef<Record<string, LinkPreview>>({});
  const linkPreviewInFlightRef = useRef<Set<string>>(new Set());
  const linkPreviewQueuedRef = useRef<Set<string>>(new Set());
  const linkPreviewQueueRef = useRef<string[]>([]);
  const linkPreviewActiveCountRef = useRef(0);
  const linkPreviewAccessRef = useRef<Map<string, number>>(new Map());
  const composerUploadTickerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const effectiveTier = (profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const isGoldUser = effectiveTier === "gold";
  const replyWordsUsed = useMemo(() => countWords(replyContent), [replyContent]);
  const createWordsUsed = useMemo(() => countWords(content), [content]);
  const remainingReplyWords = MAX_COMPOSER_WORDS - replyWordsUsed;
  const remainingCreateWords = MAX_COMPOSER_WORDS - createWordsUsed;
  const PULL_REFRESH_THRESHOLD = 44;
  const PULL_REFRESH_DEBOUNCE_MS = 7000;
  const isSocialPostingBlocked = isActive("social_posting_disabled");
  const replyFirstUrl = useMemo(() => {
    const url = extractFirstHttpUrl(replyContent || "");
    return url && !replyDismissedPreviewUrls.has(url) ? url : null;
  }, [replyContent, replyDismissedPreviewUrls]);
  const replyContentPreview = replyFirstUrl ? linkPreviewByUrl[replyFirstUrl] || null : null;

  useEffect(() => {
    noticesRef.current = notices;
    lastCursorRef.current = buildFeedCursor(notices[notices.length - 1]);
  }, [notices]);

  useEffect(() => {
    commentsByThreadRef.current = commentsByThread;
  }, [commentsByThread]);

  // Stable string key — identity is preserved when the set of notice IDs is
  // unchanged, even on in-place updates (like-count, comment-count). Used by
  // the likedNotices effect (below) so it doesn't refetch thread_supports on
  // every optimistic UI tick. Declared here (not next to the visibleNotices
  // memo further down) so it's initialised before the effects that consume it.
  const noticeIdsKey = useMemo(
    () => notices.map((n) => n.id).filter(Boolean).sort().join(","),
    [notices]
  );

  useEffect(() => {
    mentionDirectoryRef.current = mentionDirectory;
  }, [mentionDirectory]);

  const recordSocialFeedEvent = useCallback(async (
    threadId: string,
    eventType: SocialFeedEventType,
    metadata?: Record<string, unknown>,
  ) => {
    if (!user?.id || !threadId) return false;
    const sessionId = feedSessionIdRef.current;
    const payload = {
      p_thread_id: threadId,
      p_event_type: eventType,
      p_session_id: sessionId,
      p_metadata: metadata ?? {},
    };
    try {
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "record_social_feed_event",
        payload,
      );
      if (error) return false;
      return data === true;
    } catch {
      return false;
    }
  }, [user?.id]);

  const clearComposerUploadTicker = useCallback(() => {
    if (composerUploadTickerRef.current) {
      window.clearInterval(composerUploadTickerRef.current);
      composerUploadTickerRef.current = null;
    }
  }, []);

  const startComposerUploadTicker = useCallback((scope: "thread" | "reply") => {
    clearComposerUploadTicker();
    setComposerUploadState({ scope, status: "uploading", progress: 8 });
    composerUploadTickerRef.current = window.setInterval(() => {
      setComposerUploadState((prev) => {
        if (prev.scope !== scope || prev.status !== "uploading") return prev;
        return { ...prev, progress: Math.min(prev.progress + 6, 92) };
      });
    }, 180);
  }, [clearComposerUploadTicker]);

  useEffect(() => () => clearComposerUploadTicker(), [clearComposerUploadTicker]);

  const openProfile = useCallback((userId: string, fallbackName: string, threadId?: string) => {
    if (!userId) return;
    if (threadId) {
      void recordSocialFeedEvent(threadId, "profile_view");
    }
    setProfileUserId(userId);
    setProfileFallbackName(fallbackName);
    setProfileOpen(true);
  }, [recordSocialFeedEvent]);

  const upsertMentionDirectory = useCallback((profiles: MentionSuggestion[]) => {
    if (profiles.length === 0) return;
    setMentionDirectory((prev) => {
      let changed = false;
      const next = { ...prev };
      profiles.forEach((entry) => {
        const key = entry.socialId.toLowerCase();
        const existing = prev[key];
        if (
          existing &&
          existing.userId === entry.userId &&
          existing.socialId === entry.socialId &&
          existing.displayName === entry.displayName &&
          existing.avatarUrl === entry.avatarUrl
        ) {
          return;
        }
        next[key] = entry;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const mergeMentionSeeds = useCallback((entries: MentionSeed[]) => {
    if (entries.length === 0) return;
    setMentionSeeds((prev) => {
      const next = new Map<string, MentionSeed>();
      [...prev, ...entries].forEach((entry) => {
        const key = entry.userId;
        const existing = next.get(key);
        if (!existing) {
          next.set(key, entry);
          return;
        }
        next.set(key, {
          ...existing,
          socialId: entry.socialId || existing.socialId,
          displayName: entry.displayName || existing.displayName,
          avatarUrl: entry.avatarUrl ?? existing.avatarUrl,
          score: Math.max(existing.score, entry.score),
          lastSeenAt: Math.max(existing.lastSeenAt || 0, entry.lastSeenAt || 0) || undefined,
        });
      });
      return Array.from(next.values()).sort((a, b) => {
        if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
        return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
      });
    });
  }, []);

  const rankMentionSuggestions = useCallback((
    query: string,
    candidates: MentionSeed[],
    limit: number,
    localOnly: boolean
  ) => {
    const normalized = query.trim().toLowerCase();
    return dedupeMentionSuggestions(
      [...candidates]
      .filter((candidate) => {
        if (!candidate.socialId) return false;
        if (!normalized) return true;
        const socialId = candidate.socialId.toLowerCase();
        const displayName = candidate.displayName.toLowerCase();
        if (localOnly) return socialId.startsWith(normalized) || displayName.startsWith(normalized);
        return socialId.includes(normalized) || displayName.includes(normalized);
      })
      .map((candidate) => {
        const socialId = candidate.socialId.toLowerCase();
        const displayName = candidate.displayName.toLowerCase();
        let rank = candidate.score;
        if (normalized) {
          if (socialId === normalized) rank += 120;
          else if (socialId.startsWith(normalized)) rank += 80;
          else if (displayName.startsWith(normalized)) rank += 45;
          else if (socialId.includes(normalized)) rank += 24;
          else if (displayName.includes(normalized)) rank += 12;
        }
        return { ...candidate, rank };
      })
      .sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
      })
      .slice(0, limit)
      .map(({ userId, socialId, displayName, avatarUrl }) => ({ userId, socialId, displayName, avatarUrl }))
    );
  }, []);

  const searchMentionProfiles = useCallback(
    async (query: string) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return rankMentionSuggestions("", mentionSeeds, 10, true);
      }
      if (normalized.length < 2) {
        const shortlist = rankMentionSuggestions(normalized, mentionSeeds, 10, true);
        if (shortlist.length > 0) return shortlist;
      }
      const [socialIdResult, displayNameResult, containsSocialResult, containsDisplayResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, social_id, display_name, avatar_url")
          .ilike("social_id", `${normalized}%`)
          .neq("id", user?.id || "")
          .limit(6),
        supabase
          .from("profiles")
          .select("id, social_id, display_name, avatar_url")
          .ilike("display_name", `${normalized}%`)
          .neq("id", user?.id || "")
          .limit(6),
        normalized.length >= 2
          ? supabase
              .from("profiles")
              .select("id, social_id, display_name, avatar_url")
              .ilike("social_id", `%${normalized}%`)
              .neq("id", user?.id || "")
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
        normalized.length >= 2
          ? supabase
              .from("profiles")
              .select("id, social_id, display_name, avatar_url")
              .ilike("display_name", `%${normalized}%`)
              .neq("id", user?.id || "")
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (socialIdResult.error || displayNameResult.error || containsSocialResult.error || containsDisplayResult.error) {
        console.error("[social.mentions.suggest_failed]", {
          query: normalized,
          socialIdError: socialIdResult.error?.message,
          displayNameError: displayNameResult.error?.message,
          containsSocialError: containsSocialResult.error?.message,
          containsDisplayError: containsDisplayResult.error?.message,
        });
        return [];
      }

      const mergedRows = [
        ...((socialIdResult.data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>),
        ...((displayNameResult.data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>),
        ...((containsSocialResult.data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>),
        ...((containsDisplayResult.data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>),
      ];

      const seeded = Array.from(
        new Map(
          mergedRows.map((row) => [
            row.id,
            {
              userId: row.id,
              socialId: String(row.social_id || "").trim(),
              displayName: String(row.display_name || row.social_id || "User").trim(),
              avatarUrl: row.avatar_url || null,
            },
          ])
        ).values()
      )
        .filter((row) => row.socialId.length > 0)
        .map((row) => ({
          userId: row.userId,
          socialId: row.socialId,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          score: mentionSeeds.find((seed) => seed.userId === row.userId)?.score ?? 0,
          lastSeenAt: mentionSeeds.find((seed) => seed.userId === row.userId)?.lastSeenAt,
        }));

      mergeMentionSeeds(seeded);
      upsertMentionDirectory(seeded);
      return rankMentionSuggestions(normalized, [...mentionSeeds, ...seeded], 10, false);
    },
    [mentionSeeds, mergeMentionSeeds, rankMentionSuggestions, upsertMentionDirectory, user?.id]
  );

  const primeMentionDirectory = useCallback(
    async (texts: string[]) => {
      const tokens = Array.from(new Set(texts.flatMap((value) => extractMentionKeys(value))));
      const unknownTokens = tokens.filter((token) => !mentionDirectoryRef.current[token]);
      if (unknownTokens.length === 0) return;

      const orFilters = unknownTokens.map((token) => `social_id.ilike.${token}`).join(",");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, social_id, display_name, avatar_url")
        .or(orFilters);

      if (error) {
        console.error("[social.mentions.prime_failed]", { error: error.message, tokens: unknownTokens });
        return;
      }

      upsertMentionDirectory(
        ((data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>)
          .map((row) => ({
            userId: row.id,
            socialId: String(row.social_id || "").trim(),
            displayName: String(row.display_name || row.social_id || "User").trim(),
            avatarUrl: row.avatar_url || null,
          }))
          .filter((row) => row.socialId.length > 0)
      );
    },
    [upsertMentionDirectory]
  );

  const resolveMentionsFromText = useCallback(
    async (value: string, currentEntries: MentionEntry[]) => {
      const tokens = Array.from(new Set(extractMentionKeys(value)));
      if (tokens.length === 0) return [] as MentionEntry[];

      const knownByToken = new Map<string, MentionSuggestion>();
      tokens.forEach((token) => {
        const cached = mentionDirectory[token];
        if (cached) knownByToken.set(token, cached);
      });

      const unresolved = tokens.filter((token) => !knownByToken.has(token));
      if (unresolved.length > 0) {
        const orFilters = unresolved.map((token) => `social_id.ilike.${token}`).join(",");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, social_id, display_name, avatar_url")
          .or(orFilters)
          .neq("id", user?.id || "");
        if (error) {
          console.error("[social.mentions.resolve_failed]", { error: error.message, unresolved });
        } else {
          const resolved = ((data || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>)
            .map((row) => ({
              userId: row.id,
              socialId: String(row.social_id || "").trim(),
              displayName: String(row.display_name || row.social_id || "User").trim(),
              avatarUrl: row.avatar_url || null,
            }))
            .filter((row) => row.socialId.length > 0);
          upsertMentionDirectory(resolved);
          resolved.forEach((entry) => {
            knownByToken.set(entry.socialId.toLowerCase(), entry);
          });
        }
      }

      const typedEntries: MentionEntry[] = [];
      let match: RegExpExecArray | null;
      mentionTokenMatcher.lastIndex = 0;
      while ((match = mentionTokenMatcher.exec(value)) !== null) {
        const token = String(match[1] || "").toLowerCase();
        const resolved = knownByToken.get(token);
        if (!resolved) continue;
        typedEntries.push({
          start: match.index,
          end: match.index + match[0].length,
          mentionedUserId: resolved.userId,
          socialIdAtTime: resolved.socialId,
        });
      }

      return dedupeMentionEntries([...rebaseMentionEntries(value, currentEntries), ...typedEntries]).sort((a, b) => a.start - b.start);
    },
    [mentionDirectory, upsertMentionDirectory, user?.id]
  );

  useEffect(() => {
    if (!user?.id) {
      setMentionSeeds([]);
      return;
    }

    let cancelled = false;

    const loadMentionSeeds = async () => {
      const seedMap = new Map<string, MentionSeed>();
      const addSeed = (entry: MentionSeed) => {
        if (!entry.userId || !entry.socialId) return;
        const existing = seedMap.get(entry.userId);
        if (!existing) {
          seedMap.set(entry.userId, entry);
          return;
        }
        seedMap.set(entry.userId, {
          ...existing,
          score: Math.max(existing.score, entry.score),
          lastSeenAt: Math.max(existing.lastSeenAt || 0, entry.lastSeenAt || 0) || undefined,
          displayName: entry.displayName || existing.displayName,
          socialId: entry.socialId || existing.socialId,
          avatarUrl: entry.avatarUrl ?? existing.avatarUrl,
        });
      };

      const seedUsersFromFeed = () => {
        // Read from refs so this effect only re-runs on user change, not on every like/comment.
        noticesRef.current.forEach((notice) => {
          if (!notice.user_id) return;
          addSeed({
            userId: notice.user_id,
            socialId: notice.author?.social_id || "",
            displayName: notice.author?.display_name || notice.author?.social_id || "User",
            avatarUrl: notice.author?.avatar_url || null,
            score: 35,
            lastSeenAt: new Date(notice.created_at).getTime(),
          });
        });
        Object.values(commentsByThreadRef.current).flat().forEach((comment) => {
          if (!comment.user_id) return;
          addSeed({
            userId: comment.user_id,
            socialId: comment.author?.social_id || "",
            displayName: comment.author?.display_name || comment.author?.social_id || "User",
            avatarUrl: comment.author?.avatar_url || null,
            score: 28,
            lastSeenAt: new Date(comment.created_at).getTime(),
          });
        });
      };

      seedUsersFromFeed();

      const [familyResult, matchesResult, chatsResult, mentionPostsResult, mentionRepliesResult] = await Promise.all([
        supabase
          .from("family_members")
          .select("inviter_user_id, invitee_user_id, created_at")
          .eq("status", "accepted")
          .or(`inviter_user_id.eq.${user.id},invitee_user_id.eq.${user.id}`),
        supabase
          .from("matches")
          .select("user1_id, user2_id, last_interaction_at")
          .eq("is_active", true)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order("last_interaction_at", { ascending: false })
          .limit(12),
        supabase
          .from("chat_participants")
          .select("user_id, joined_at, chats!chat_participants_chat_id_fkey(last_message_at)")
          .neq("user_id", user.id)
          .limit(24),
        supabase
          .from("post_mentions" as never)
          .select("mentioned_user_id, created_at, threads!post_mentions_post_id_fkey(user_id)")
          .limit(24),
        supabase
          .from("reply_mentions" as never)
          .select("mentioned_user_id, created_at, thread_comments!reply_mentions_reply_id_fkey(user_id)")
          .limit(24),
      ]);

      const collectProfileIds = new Set<string>();

      if (!familyResult.error) {
        ((familyResult.data || []) as Array<{ inviter_user_id: string; invitee_user_id: string; created_at?: string | null }>).forEach((row) => {
          const otherId = row.inviter_user_id === user.id ? row.invitee_user_id : row.inviter_user_id;
          if (!otherId || otherId === user.id) return;
          collectProfileIds.add(otherId);
          addSeed({
            userId: otherId,
            socialId: "",
            displayName: "User",
            avatarUrl: null,
            score: 90,
            lastSeenAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
          });
        });
      }

      if (!matchesResult.error) {
        ((matchesResult.data || []) as Array<{ user1_id: string; user2_id: string; last_interaction_at?: string | null }>).forEach((row) => {
          const otherId = row.user1_id === user.id ? row.user2_id : row.user1_id;
          if (!otherId || otherId === user.id) return;
          collectProfileIds.add(otherId);
          addSeed({
            userId: otherId,
            socialId: "",
            displayName: "User",
            avatarUrl: null,
            score: 82,
            lastSeenAt: row.last_interaction_at ? new Date(row.last_interaction_at).getTime() : undefined,
          });
        });
      }

      if (!chatsResult.error) {
        ((chatsResult.data || []) as Array<{ user_id: string; joined_at?: string | null; chats?: { last_message_at?: string | null } | null }>).forEach((row) => {
          if (!row.user_id || row.user_id === user.id) return;
          collectProfileIds.add(row.user_id);
          addSeed({
            userId: row.user_id,
            socialId: "",
            displayName: "User",
            avatarUrl: null,
            score: 58,
            lastSeenAt: row.chats?.last_message_at ? new Date(row.chats.last_message_at).getTime() : row.joined_at ? new Date(row.joined_at).getTime() : undefined,
          });
        });
      }

      if (!mentionPostsResult.error) {
        ((mentionPostsResult.data || []) as Array<{ mentioned_user_id: string; created_at?: string | null; threads?: { user_id?: string | null } | null }>).forEach((row) => {
          if (row.threads?.user_id !== user.id || !row.mentioned_user_id) return;
          collectProfileIds.add(row.mentioned_user_id);
          addSeed({
            userId: row.mentioned_user_id,
            socialId: "",
            displayName: "User",
            avatarUrl: null,
            score: 52,
            lastSeenAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
          });
        });
      } else if (import.meta.env.DEV) {
        console.warn("[social.mentions.seed_post_failed]", mentionPostsResult.error);
      }

      if (!mentionRepliesResult.error) {
        ((mentionRepliesResult.data || []) as Array<{ mentioned_user_id: string; created_at?: string | null; thread_comments?: { user_id?: string | null } | null }>).forEach((row) => {
          if (row.thread_comments?.user_id !== user.id || !row.mentioned_user_id) return;
          collectProfileIds.add(row.mentioned_user_id);
          addSeed({
            userId: row.mentioned_user_id,
            socialId: "",
            displayName: "User",
            avatarUrl: null,
            score: 48,
            lastSeenAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
          });
        });
      } else if (import.meta.env.DEV) {
        console.warn("[social.mentions.seed_reply_failed]", mentionRepliesResult.error);
      }

      const unresolvedIds = Array.from(collectProfileIds).filter((id) => !Array.from(seedMap.values()).some((entry) => entry.userId === id && entry.socialId));
      if (unresolvedIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, social_id, display_name, avatar_url")
          .in("id", unresolvedIds);
        if (!profilesError) {
          ((profilesData || []) as Array<{ id: string; social_id?: string | null; display_name?: string | null; avatar_url?: string | null }>).forEach((row) => {
            const existing = seedMap.get(row.id);
            addSeed({
              userId: row.id,
              socialId: String(row.social_id || "").trim(),
              displayName: String(row.display_name || row.social_id || "User").trim(),
              avatarUrl: row.avatar_url || null,
              score: existing?.score ?? 0,
              lastSeenAt: existing?.lastSeenAt,
            });
          });
        }
      }

      const finalSeeds = Array.from(seedMap.values())
        .filter((entry) => entry.socialId && entry.userId !== user.id)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
        })
        .slice(0, 24);
      if (cancelled) return;
      setMentionSeeds((prev) => (sameMentionSeedList(prev, finalSeeds) ? prev : finalSeeds));
      upsertMentionDirectory(finalSeeds);
    };

    void loadMentionSeeds();

    return () => {
      cancelled = true;
    };
  // Reads from noticesRef/commentsByThreadRef so it doesn't cascade on every like or reply.
  }, [upsertMentionDirectory, user?.id]);

  const insertMentionIntoComposer = useCallback(
    (
      kind: "create" | "reply",
      suggestion: MentionSuggestion,
      queryState: ActiveMentionQuery | null,
      value: string,
      entries: MentionEntry[],
      input: HTMLTextAreaElement | null
    ) => {
      if (!queryState) return;
      const replacement = `@${suggestion.socialId} `;
      const nextValue = value.slice(0, queryState.tokenStart) + replacement + value.slice(queryState.tokenEnd);
      const nextCaret = queryState.tokenStart + replacement.length;
      const nextEntries = rebaseMentionEntries(nextValue, [
        ...entries.filter((entry) => entry.end <= queryState.tokenStart || entry.start >= queryState.tokenEnd),
        {
          start: queryState.tokenStart,
          end: queryState.tokenStart + replacement.trimEnd().length,
          mentionedUserId: suggestion.userId,
          socialIdAtTime: suggestion.socialId,
        },
      ]);

      if (kind === "create") {
        setContent(nextValue);
        setCreateMentions(nextEntries);
        setCreateMentionQuery(null);
        setCreateMentionSuggestions([]);
      } else {
        setReplyContent(nextValue);
        setReplyMentions(nextEntries);
        setReplyMentionQuery(null);
        setReplyMentionSuggestions([]);
      }

      requestAnimationFrame(() => {
        if (!input) return;
        const activeElement = document.activeElement;
        const scrollParent = findNearestScrollableAncestor(input);
        const preservedScrollTop = scrollParent?.scrollTop ?? null;
        const preservedWindowY = window.scrollY;
        if (activeElement !== input) {
          input.focus({ preventScroll: true });
        }
        input.setSelectionRange(nextCaret, nextCaret);
        if (scrollParent && preservedScrollTop != null) {
          scrollParent.scrollTop = preservedScrollTop;
        }
        if (window.scrollY !== preservedWindowY) {
          window.scrollTo({ top: preservedWindowY, behavior: "auto" });
        }
      });
    },
    []
  );

  const getDerivedAlertType = useCallback((notice: Thread): "Stray" | "Lost" | "Caution" | "Others" | null => {
    const stateType = newsAlertTypeByThread[notice.id];
    if (stateType) return stateType;
    return deriveAlertTypeFromNoticeData(notice);
  }, [newsAlertTypeByThread]);

  const applyFeedFilters = useCallback((rows: Thread[]) => {
    return rows;
  }, []);

  const fetchFeedPage = useCallback(async (cursor: FeedCursor | null = null) => {
    if (!user?.id) return [];
    return fetchFeedPageData({
      viewerId: user.id,
      sortMode,
      cursor,
      applyFeedFilters,
    });
  }, [applyFeedFilters, sortMode, user?.id]);

  const hydrateRows = useCallback(async (rows: Thread[]): Promise<HydratedRowsResult> => {
    return hydrateFeedRows(rows, {
      deriveAlertTypeFromNoticeData,
      primeMentionDirectory,
    });
  }, [primeMentionDirectory]);

  const applyHydratedRows = useCallback((payload: HydratedRowsResult, options?: { reset?: boolean }) => {
    const reset = options?.reset === true;
    const hydratedThreadIds = Object.keys(payload.commentsByThread);

    setCommentsByThread((prev) => (reset ? payload.commentsByThread : { ...prev, ...payload.commentsByThread }));
    setCommentLoadErrors((prev) => {
      if (hydratedThreadIds.length === 0) return reset ? {} : prev;
      const next = reset ? {} : { ...prev };
      hydratedThreadIds.forEach((threadId) => {
        delete next[threadId];
      });
      return next;
    });
    setThreadMentionsById((prev) => (reset ? payload.threadMentions : { ...prev, ...payload.threadMentions }));
    setReplyMentionsById((prev) => (reset ? payload.replyMentions : { ...prev, ...payload.replyMentions }));
    setNewsAlertTypeByThread((prev) => (reset ? payload.alertTypes : { ...prev, ...payload.alertTypes }));
  }, []);

  const resetHydrationState = useCallback(() => {
    setCommentsByThread({});
    setCommentsLoadingThreads(new Set());
    setCommentLoadErrors({});
    setThreadMentionsById({});
    setReplyMentionsById({});
    setNewsAlertTypeByThread({});
  }, []);

  const fetchFocusedThreadRow = useCallback(async (threadId: string) => fetchFocusedThreadRowData(threadId), []);

  const fetchNotices = useCallback(async (reset: boolean = false) => {
    const requestToken = ++feedRequestTokenRef.current;
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      if (!user?.id) {
        setNotices([]);
        resetHydrationState();
        setHasMore(false);
        return;
      }

      if (reset) {
        const [pageRows, focusedRow] = await Promise.all([
          fetchFeedPage(null),
          focusThreadId ? fetchFocusedThreadRow(focusThreadId) : Promise.resolve(null),
        ]);
        if (feedRequestTokenRef.current !== requestToken) return;

        let nextRows = pageRows;
        if (focusedRow && !nextRows.some((item) => item.id === focusedRow.id)) {
          nextRows = [focusedRow, ...nextRows];
        } else if (focusThreadId && !nextRows.some((item) => item.id === focusThreadId) && focusFallbackShownRef.current !== focusThreadId) {
          focusFallbackShownRef.current = focusThreadId;
          toast.info("That post is no longer available.");
          setFocusedThreadId(null);
        }

        resetHydrationState();
        noticesRef.current = nextRows;
        setNotices(nextRows);
        lastCursorRef.current = buildFeedCursor(nextRows[nextRows.length - 1]);
        setHasMore(pageRows.length === 20);
        setLoading(false);

        void (async () => {
          const hydrated = await hydrateRows(nextRows);
          if (feedRequestTokenRef.current !== requestToken) return;
          noticesRef.current = hydrated.rows;
          setNotices(hydrated.rows);
          applyHydratedRows(hydrated, { reset: true });
        })();
        return;
      } else {
        const pageRows = await fetchFeedPage(lastCursorRef.current);
        if (feedRequestTokenRef.current !== requestToken) return;
        const existingIds = new Set(noticesRef.current.map((notice) => notice.id));
        const uniqueOlderRows = pageRows.filter((notice) => !existingIds.has(notice.id));
        const hydrated = await hydrateRows(uniqueOlderRows);
        if (feedRequestTokenRef.current !== requestToken) return;
        const merged = [...noticesRef.current, ...hydrated.rows];
        noticesRef.current = merged;
        setNotices(merged);
        applyHydratedRows(hydrated);
        lastCursorRef.current = buildFeedCursor(noticesRef.current[noticesRef.current.length - 1]);
        setHasMore(pageRows.length === 20);
      }
    } catch (error) {
      console.error("Error fetching notices:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [applyHydratedRows, fetchFeedPage, fetchFocusedThreadRow, focusThreadId, hydrateRows, resetHydrationState, user?.id]);

  useEffect(() => {
    fetchNotices(true);
  }, [fetchNotices]);

  const fetchNewerNotices = useCallback(async () => {
    if (!user?.id) return false;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < PULL_REFRESH_DEBOUNCE_MS) return false;
    lastRefreshAtRef.current = now;

    const latestRows = await fetchFeedPage(null);
    const existingIds = new Set(noticesRef.current.map((notice) => notice.id));
    const incoming = latestRows.filter((notice) => !existingIds.has(notice.id));

    if (incoming.length === 0) {
      toast.success("All caught up! ✨");
      return false;
    }

    const hydrated = await hydrateRows(incoming);
    const merged = [...hydrated.rows, ...noticesRef.current];
    noticesRef.current = merged;
    setNotices(merged);
    applyHydratedRows(hydrated);
    lastCursorRef.current = buildFeedCursor(merged[merged.length - 1]);
    toast.success("All caught up! ✨");
    return true;
  }, [applyHydratedRows, fetchFeedPage, hydrateRows, user?.id]);

  // noticeIdsKey changes only when the set of IDs changes, not on in-place updates (like count, etc.)
  // This prevents a thread_supports DB round-trip on every optimistic like toggle.
  useEffect(() => {
    if (!user?.id) {
      setLikedNotices(new Set());
      return;
    }
    const ids = noticeIdsKey.split(",").filter(Boolean);
    if (ids.length === 0) {
      setLikedNotices(new Set());
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from("thread_supports" as "profiles")
        .select("thread_id")
        .eq("user_id", user.id)
        .in("thread_id", ids);
      if (error) return;
      const next = new Set(
        (((data || []) as Array<{ thread_id?: string | null }>).map((row) => row.thread_id).filter(Boolean)) as string[]
      );
      setLikedNotices(next);
    })();
  }, [noticeIdsKey, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setBlockedUsers(new Set());
      return;
    }
    void (async () => {
      const ids = await loadBlockedUserIdsFor(user.id);
      setBlockedUsers(ids);
    })();
  }, [user?.id]);

  useEffect(() => {
    setFocusedThreadId(focusThreadId || null);
    lastAutoFocusedThreadRef.current = null;
    if (focusThreadId) {
      setTopicFilters([]);
    }
  }, [focusThreadId]);

  useEffect(() => {
    if (!focusedThreadId) return;
    if (lastAutoFocusedThreadRef.current === focusedThreadId) return;
    const node = threadRefs.current[focusedThreadId];
    if (!node) {
      const idx = notices.findIndex((n) => n.id === focusedThreadId);
      if (idx >= 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: idx, align: "start", behavior: "auto" });
      }
      return;
    }
    lastAutoFocusedThreadRef.current = focusedThreadId;
    const scroller = scrollContainerRef?.current;
    if (scroller) {
      const targetTop =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        8;
      scroller.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "auto",
      });
    } else {
      node.scrollIntoView({ behavior: "auto", block: "start" });
    }
    const timer = window.setTimeout(() => {
      setFocusedThreadId((current) => (current === focusedThreadId ? null : current));
    }, 1800);
    if (import.meta.env.DEV) {
      console.info(`[SOCIAL_FOCUS_OK] thread=${focusedThreadId}`);
    }
    return () => window.clearTimeout(timer);
  }, [focusedThreadId, notices, scrollContainerRef]);

  useEffect(() => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    const handleScroll = () => {
      if (loading || loadingMore || !hasMore) return;
      const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (remaining > 320) return;
      void fetchNotices(false);
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [fetchNotices, hasMore, loading, loadingMore, scrollContainerRef]);

  useEffect(() => {
    if (composeSignal > 0) {
      if (isSocialPostingBlocked) {
        setSocialRestrictionModalOpen(true);
      } else {
        setIsCreateOpen(true);
      }
    }
  }, [composeSignal, isSocialPostingBlocked]);

  useEffect(() => {
    if (!MENTION_LIVE_SUGGESTIONS_ENABLED) {
      setCreateMentionSuggestions([]);
      return;
    }
    if (createMentionQuery == null) {
      setCreateMentionSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchMentionProfiles(createMentionQuery.query).then((results) => {
        if (!cancelled) setCreateMentionSuggestions(results);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createMentionQuery, searchMentionProfiles]);

  useEffect(() => {
    if (!MENTION_LIVE_SUGGESTIONS_ENABLED) {
      setReplyMentionSuggestions([]);
      return;
    }
    if (replyMentionQuery == null) {
      setReplyMentionSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchMentionProfiles(replyMentionQuery.query).then((results) => {
        if (!cancelled) setReplyMentionSuggestions(results);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [replyMentionQuery, searchMentionProfiles]);

  const handleCreateInputChange = (value: string, caret: number) => {
    setContent(value);
    setCreateMentions((prev) => rebaseMentionEntries(value, prev));
    setCreateMentionQuery((prev) => {
      const next = findActiveMentionQuery(value, caret);
      return sameMentionQuery(prev, next) ? prev : next;
    });
    setCreateErrors((prev) => ({ ...prev, content: undefined }));
  };

  const handleReplyInputChange = (value: string, caret: number) => {
    setReplyContent(value);
    setReplyMentions((prev) => rebaseMentionEntries(value, prev));
    setReplyMentionQuery((prev) => {
      const next = findActiveMentionQuery(value, caret);
      return sameMentionQuery(prev, next) ? prev : next;
    });
    setReplyError("");
  };

  const snapToCommentArea = useCallback(
    (threadId: string, target: "panel" | "composer" = "panel", focusComposer: boolean = false) => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          const node =
            target === "composer"
              ? replyComposerRefs.current[threadId] || commentPanelRefs.current[threadId]
              : commentPanelRefs.current[threadId] || replyComposerRefs.current[threadId];
          if (!node) return;

          const scroller = scrollContainerRef?.current;
          if (scroller) {
            const targetTop =
              node.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop -
              12;
            scroller.scrollTo({
              top: Math.max(0, targetTop),
              behavior: "smooth",
            });
          } else {
            node.scrollIntoView({ behavior: "smooth", block: "start" });
          }

          if (focusComposer) {
            replyInputRef.current?.focus({ preventScroll: true });
          }
        });
      }, 80);
    },
    [scrollContainerRef]
  );

  const openThreadQuotaDialog = () => {
    const tier = (profile?.effective_tier || profile?.tier || "free").toLowerCase();
    if (tier === "gold" || tier === "plus" || tier === "free") {
      const ctaRequired = tier !== "gold";
      showUpsellBanner({
        message: quotaConfig.copy.threads.exhausted[tier],
        ctaLabel: ctaRequired ? "See plans" : undefined,
        onCta: ctaRequired ? onPremiumClick : undefined,
      });
      return;
    }
    showUpsellBanner({
      message: quotaConfig.copy.threads.exhausted.free,
      ctaLabel: "See plans",
      onCta: onPremiumClick,
    });
  };

  const revokeComposerMedia = useCallback((items: ComposerMedia[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const resetReplyComposerDraft = useCallback(() => {
    setReplyTargetCommentId(null);
    setReplyContent("");
    setReplyDismissedPreviewUrls(new Set());
    setReplyMentions([]);
    setReplyMentionQuery(null);
    setReplyMentionSuggestions([]);
    setReplyComposerFocused(false);
    revokeComposerMedia(replyMediaFiles);
    setReplyMediaFiles([]);
    setReplyError("");
  }, [replyMediaFiles, revokeComposerMedia]);

  const removeCreateMediaAt = (index: number) => {
    setCreateMediaFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const removeReplyMediaAt = (index: number) => {
    setReplyMediaFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const updateCreateVideoTrimStart = (index: number, value: number) => {
    setCreateMediaFiles((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index && item.kind === "video"
          ? { ...item, trimStartSeconds: Math.max(0, value) }
          : item,
      ),
    );
  };

  const prepareComposerMedia = useCallback(async (files: FileList | null, existingItems: ComposerMedia[], options: { allowVideo: boolean }) => {
    if (!files?.length) return [] as ComposerMedia[];

    const existingCount = existingItems.length;
    const existingVideoCount = existingItems.filter((item) => item.kind === "video").length;
    const incomingVideoCount = Array.from(files).filter(isVideoFile).length;
    if (!options.allowVideo && incomingVideoCount > 0) {
      toast.error("Video can only be added to a post.");
      return [];
    }
    if (existingVideoCount > 0 && incomingVideoCount > 0) {
      toast.error("Only one video can be added to a post.");
      return [];
    }
    if (incomingVideoCount > 1) {
      toast.error("Only one video can be added to a post.");
      return [];
    }

    const availableSlots = Math.max(0, MAX_COMPOSER_MEDIA - existingCount);
    if (availableSlots === 0) {
      toast.error(`You can upload up to ${MAX_COMPOSER_MEDIA} items.`);
      return [];
    }

    const picked = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      toast.info(`Only the first ${MAX_COMPOSER_MEDIA} files are kept.`);
    }

    const prepared: ComposerMedia[] = [];
    for (const file of picked) {
      const kind = isVideoFile(file) ? "video" : "image";
      if (kind === "video" && !isGoldUser) {
        toast.error("Video upload is available for Gold members only.");
        continue;
      }

      let nextFile = file;
      let durationSeconds: number | undefined;
      let needsTrim = false;
      if (kind === "image") {
        try {
          const { default: imageCompression } = await import("browser-image-compression");
          nextFile = await imageCompression(file, {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1800,
            useWebWorker: true,
          });
        } catch {
          toast.error("Failed to process image");
          continue;
        }
      } else {
        try {
          durationSeconds = await getVideoDuration(file);
          needsTrim = durationSeconds > SOCIAL_VIDEO_MAX_SECONDS + 0.2;
        } catch {
          toast.error("Failed to read video duration");
          continue;
        }
      }

      prepared.push({
        file: nextFile,
        kind,
        previewUrl: URL.createObjectURL(nextFile),
        durationSeconds,
        needsTrim,
        trimStartSeconds: 0,
      });
    }

    return prepared;
  }, [isGoldUser]);

  const handleCreateMediaChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const prepared = await prepareComposerMedia(event.target.files, createMediaFiles, { allowVideo: true });
    if (prepared.length > 0) {
      setCreateMediaFiles((prev) => [...prev, ...prepared]);
      const firstImage = prepared.find((item) => item.kind === "image");
      if (firstImage) {
        void detectSensitiveImage(firstImage.file)
          .then((result) => {
            if (!result.isSensitive) return;
            setCreateIsSensitive(true);
            setCreateSensitiveSuggested(true);
          })
          .catch(() => {
            // Soft suggestion only.
          });
      }
    }
    event.target.value = "";
  };

  const handleReplyMediaChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const prepared = await prepareComposerMedia(event.target.files, replyMediaFiles, { allowVideo: false });
    if (prepared.length > 0) {
      setReplyMediaFiles((prev) => [...prev, ...prepared]);
    }
    event.target.value = "";
  };

  useEffect(() => {
    if (createMediaFiles.length > 0) return;
    setCreateIsSensitive(false);
    setCreateSensitiveSuggested(false);
  }, [createMediaFiles.length]);

  const uploadComposerMedia = useCallback(async (items: ComposerMedia[], scope: "thread" | "reply") => {
    if (!user?.id || items.length === 0) return [] as string[];
    const imageItems = items.filter((media) => media.kind === "image");
    if (imageItems.length === 0) return [] as string[];

    startComposerUploadTicker(scope);
    const uploadedUrls: string[] = [];
    try {
      for (const [index, item] of imageItems.entries()) {
        const fileExt = item.file.name.split(".").pop() || (item.kind === "video" ? "mp4" : "jpg");
        const fileName = `${user.id}/${scope}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("notices").upload(fileName, item.file);
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from("notices").getPublicUrl(fileName);
        uploadedUrls.push(publicData.publicUrl);
        const ratio = (index + 1) / items.length;
        setComposerUploadState({ scope, status: "uploading", progress: Math.max(8, Math.min(96, Math.round(8 + ratio * 88))) });
      }
      clearComposerUploadTicker();
      setComposerUploadState({ scope, status: "success", progress: 100 });
      window.setTimeout(() => {
        setComposerUploadState((prev) => (prev.scope === scope ? { scope: null, status: "idle", progress: 0 } : prev));
      }, 1200);
    } catch (error) {
      clearComposerUploadTicker();
      setComposerUploadState({ scope, status: "error", progress: 0 });
      window.setTimeout(() => {
        setComposerUploadState((prev) => (prev.scope === scope ? { scope: null, status: "idle", progress: 0 } : prev));
      }, 2000);
      throw error;
    }

    return uploadedUrls;
  }, [clearComposerUploadTicker, startComposerUploadTicker, user?.id]);

  const uploadCreateVideo = useCallback(async (items: ComposerMedia[]) => {
    const videoItem = items.find((item) => item.kind === "video");
    if (!videoItem) return null as SocialVideoMetadata | null;
    if (!isGoldUser) throw new Error("Video upload is available for Gold members only.");

    startComposerUploadTicker("thread");
    try {
      const trimmedFile = videoItem.needsTrim
        ? await compressAndTrimVideo(videoItem.file, {
            startSeconds: videoItem.trimStartSeconds || 0,
            durationSeconds: SOCIAL_VIDEO_MAX_SECONDS,
          })
        : await compressAndTrimVideo(videoItem.file, {
            startSeconds: 0,
            durationSeconds: Math.min(videoItem.durationSeconds || SOCIAL_VIDEO_MAX_SECONDS, SOCIAL_VIDEO_MAX_SECONDS),
          });
      const duration = await getVideoDuration(trimmedFile);
      if (duration > SOCIAL_VIDEO_MAX_SECONDS + 0.5) {
        throw new Error("Video must be trimmed to 15 seconds before upload.");
      }
      const video = await uploadSocialVideoToBunny(trimmedFile, {
        title: title.trim() || "Social video",
        durationSeconds: duration,
        onProgress: (progress) => setComposerUploadState({ scope: "thread", status: "uploading", progress }),
      });
      clearComposerUploadTicker();
      setComposerUploadState({ scope: "thread", status: "success", progress: 100 });
      return video;
    } catch (error) {
      clearComposerUploadTicker();
      setComposerUploadState({ scope: "thread", status: "error", progress: 0 });
      throw error;
    }
  }, [clearComposerUploadTicker, isGoldUser, startComposerUploadTicker, title]);

  const enqueueSocialNotification = useCallback(
    async (args: {
      userId: string;
      kind: string;
      title: string;
      body: string;
      href: string;
      data?: Record<string, unknown>;
    }) => {
      const result = await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "enqueue_notification",
        {
          p_user_id: args.userId,
          p_category: "social",
          p_kind: args.kind,
          p_title: args.title,
          p_body: args.body,
          p_href: args.href,
          p_data: args.data ?? {},
        }
      );
      if (result.error) {
        console.error("[social.notification.failed]", {
          kind: args.kind,
          userId: args.userId,
          href: args.href,
          error: result.error.message || result.error,
        });
        return null;
      }
      return result.data;
    },
    []
  );

  const upsertNotificationWindow = useCallback(
    async (args: {
      ownerUserId: string;
      subjectId: string;
      subjectType: "thread" | "alert";
      kind: "like" | "comment" | "reply" | "alert_like";
      category: "social" | "map";
      href: string;
      actorId: string;
      actorName: string;
    }) => {
      const result = await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "upsert_notification_window",
        {
          p_owner_user_id: args.ownerUserId,
          p_subject_id: args.subjectId,
          p_subject_type: args.subjectType,
          p_kind: args.kind,
          p_category: args.category,
          p_href: args.href,
          p_actor_id: args.actorId,
          p_actor_name: args.actorName,
        }
      );
      if (result.error) {
        console.error("[social.notification_window.failed]", {
          kind: args.kind,
          ownerUserId: args.ownerUserId,
          error: result.error.message || result.error,
        });
      }
    },
    []
  );

  const persistPostMentions = useCallback(async (postId: string, entries: MentionEntry[]) => {
    if (!postId || entries.length === 0) return;
    const rows = dedupeMentionEntries(entries).map((entry) => ({
      post_id: postId,
      mentioned_user_id: entry.mentionedUserId,
      start_idx: entry.start,
      end_idx: entry.end,
      social_id_at_time: entry.socialIdAtTime,
    }));
    const { error } = await supabase.from("post_mentions" as never).insert(rows);
    if (error) {
      console.error("[social.mentions.persist_post_failed]", { postId, error: error.message, rows });
      throw error;
    }
    setThreadMentionsById((prev) => ({ ...prev, [postId]: dedupeMentionEntries(entries) }));
  }, []);

  const persistReplyMentions = useCallback(async (replyId: string, entries: MentionEntry[]) => {
    if (!replyId || entries.length === 0) return;
    const rows = dedupeMentionEntries(entries).map((entry) => ({
      reply_id: replyId,
      mentioned_user_id: entry.mentionedUserId,
      start_idx: entry.start,
      end_idx: entry.end,
      social_id_at_time: entry.socialIdAtTime,
    }));
    const { error } = await supabase.from("reply_mentions" as never).insert(rows);
    if (error) {
      console.error("[social.mentions.persist_reply_failed]", { replyId, error: error.message, rows });
      throw error;
    }
    setReplyMentionsById((prev) => ({ ...prev, [replyId]: dedupeMentionEntries(entries) }));
  }, []);

  const createMentionNotifications = useCallback(
    async (threadId: string, recipientIds: string[]) => {
      if (!user?.id || !threadId || recipientIds.length === 0) return;
      const rpc = await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
        "create_thread_mention_notifications",
        {
          p_actor_id: user.id,
          p_thread_id: threadId,
          p_recipient_ids: recipientIds,
        }
      );
      if (rpc.error) {
        console.error("[social.mentions.notify_failed]", { threadId, recipientIds, error: rpc.error.message || rpc.error });
      }
    },
    [user?.id]
  );

  const closeCreateComposer = () => {
    revokeComposerMedia(createMediaFiles);
    setCreateMediaFiles([]);
    setCreateErrors({});
    setCreateMentions([]);
    setCreateMentionQuery(null);
    setCreateMentionSuggestions([]);
    setCreateComposerFocused(false);
    setCreateIsSensitive(false);
    setCreateSensitiveSuggested(false);
    setEditingNoticeId(null);
    setLockedPreviewUrl(null);
    setDismissedPreviewUrls(new Set());
    setIsCreateOpen(false);
  };

  const handleStartEditNotice = (notice: Thread) => {
    setEditingNoticeId(notice.id);
    setTitle(notice.title || "");
    setContent(notice.content || "");
    const nextCategory = Array.isArray(notice.tags) && notice.tags.length > 0 ? String(notice.tags[0]) : "Social";
    setCategory(nextCategory || "Social");
    setCreateErrors({});
    setCreateMentions([]);
    setCreateMentionQuery(null);
    setCreateMentionSuggestions([]);
    setCreateIsSensitive(notice.is_sensitive === true);
    setCreateSensitiveSuggested(false);
    revokeComposerMedia(createMediaFiles);
    setCreateMediaFiles([]);
    setIsCreateOpen(true);
  };

  const handleDeleteNotice = async (notice: Thread) => {
    if (!user?.id || !notice?.id) return;
    if (notice.user_id !== user.id) {
      toast.error(t("You can only delete your own post"));
      return;
    }
    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) return;

    const previous = notices;
    setNotices((prev) => prev.filter((item) => item.id !== notice.id));
    try {
      const { error } = await supabase
        .from("threads" as "profiles")
        .delete()
        .eq("id", notice.id)
        .eq("user_id", user.id);
      if (error) throw error;
      if (notice.provider_video_id) {
        void deleteSocialVideo(notice.provider_video_id);
      }
      toast.success(t("Post deleted"));
    } catch (error: unknown) {
      setNotices(previous);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || t("Failed to delete post"));
    }
  };

  const handleReply = async (thread: Thread) => {
    if (isSocialPostingBlocked) {
      setSocialRestrictionModalOpen(true);
      return;
    }
    if (!user) return;
    if (!thread?.id) {
      toast.info("Thread not available.");
      return;
    }
    if (replySubmittingByThread.has(thread.id)) return;
    if (!replyContent.trim()) {
      setReplyError(t("Reply cannot be empty"));
      return;
    }
    if (replyWordsUsed > MAX_COMPOSER_WORDS) {
      setReplyError(t("Reply is too long"));
      return;
    }
    if (thread.user_id) {
      const blocked = await areUsersBlocked(user.id, thread.user_id);
      if (blocked) {
        toast.error("You cannot reply to this user.");
        return;
      }
    }

    setReplySubmittingByThread((prev) => new Set([...prev, thread.id]));
    try {
      let uploadedUrls: string[] = [];
      try {
        uploadedUrls = await uploadComposerMedia(replyMediaFiles, "reply");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload media";
        toast.error(message);
        return;
      }

      const replyText = replyContent.trim();
      const submittedParentCommentId = replyTargetCommentId;
      const { data: createdReply, error } = await supabase
        .from("thread_comments" as "profiles")
        .insert({
          thread_id: thread.id,
          parent_comment_id: submittedParentCommentId,
          user_id: user.id,
          content: replyText,
          text: replyText,
          images: uploadedUrls,
        } as Record<string, unknown>)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }

      try {
        const finalMentions = await resolveMentionsFromText(replyText, replyMentions);
        if (createdReply?.id && finalMentions.length > 0) {
          await persistReplyMentions(String(createdReply.id), finalMentions);
          await createMentionNotifications(
            thread.id,
            Array.from(new Set(finalMentions.map((entry) => entry.mentionedUserId)))
          );
        }
      } catch (mentionError) {
        console.error("[social.reply_mentions.failed]", {
          threadId: thread.id,
          replyId: createdReply?.id,
          error: mentionError,
        });
        toast.error("Reply posted, but mention syncing failed.");
      }

      if (thread.user_id && thread.user_id !== user.id) {
        await upsertNotificationWindow({
          ownerUserId: thread.user_id,
          subjectId: thread.id,
          subjectType: "thread",
          kind: "comment",
          category: "social",
          href: `/social?focus=${thread.id}`,
          actorId: user.id,
          actorName: profile?.display_name || "Someone",
        });
      }

	      if (createdReply?.id) {
        void recordSocialFeedEvent(thread.id, "comment");
	        const optimisticReply: ThreadComment = {
          id: String(createdReply.id),
          thread_id: thread.id,
          parent_comment_id: submittedParentCommentId,
          content: replyText,
          images: uploadedUrls,
          created_at: new Date().toISOString(),
          user_id: user.id,
          author: {
            display_name: profile?.display_name || "You",
            social_id: profile?.social_id || null,
            avatar_url: profile?.avatar_url || null,
          },
        };

        setCommentsByThread((prev) => ({
          ...prev,
          [thread.id]: [...(prev[thread.id] || []), optimisticReply],
        }));
        setNotices((prev) =>
          prev.map((notice) =>
            notice.id === thread.id
              ? { ...notice, comment_count: Math.max(0, Number(notice.comment_count ?? 0) + 1) }
              : notice
          )
        );
      }

      resetReplyComposerDraft();
      if (submittedParentCommentId) {
        setReplyFor(null);
      } else {
        setReplyFor(thread.id);
        snapToCommentArea(thread.id, "composer", true);
      }
    } finally {
      setReplySubmittingByThread((prev) => {
        const next = new Set(prev);
        next.delete(thread.id);
        return next;
      });
    }
  };

  const buildFallbackMentionEntries = useCallback((value: string) => {
    const fallbackEntries: MentionEntry[] = [];
    let match: RegExpExecArray | null;
    mentionTokenMatcher.lastIndex = 0;
    while ((match = mentionTokenMatcher.exec(value)) !== null) {
      const token = String(match[1] || "").toLowerCase();
      const resolved = mentionDirectory[token];
      if (!resolved) continue;
      fallbackEntries.push({
        start: match.index,
        end: match.index + match[0].length,
        mentionedUserId: resolved.userId,
        socialIdAtTime: resolved.socialId,
      });
    }
    return dedupeMentionEntries(fallbackEntries).sort((a, b) => a.start - b.start);
  }, [mentionDirectory]);

  const renderFormattedText = useCallback((value: string, keyPrefix: string) => {
    const chunks = value.split("\n");
    const nodes: ReactNode[] = [];
    chunks.forEach((chunk, lineIndex) => {
      if (lineIndex > 0) nodes.push(<br key={`${keyPrefix}-br-${lineIndex}`} />);
      if (!chunk) return;
      const lineNodes: ReactNode[] = [];
      let cursor = 0;
      let match: RegExpExecArray | null;
      urlMatcher.lastIndex = 0;

      while ((match = urlMatcher.exec(chunk)) !== null) {
        const rawUrl = match[0];
        const safeUrl = normalizeHttpUrl(rawUrl);
        if (!safeUrl) continue;
        if (match.index > cursor) {
          const textPart = chunk.slice(cursor, match.index);
          lineNodes.push(
            <span
              key={`${keyPrefix}-line-${lineIndex}-text-${cursor}`}
              dangerouslySetInnerHTML={{ __html: formatInlineMarkup(textPart) }}
            />
          );
        }
        lineNodes.push(
          <a
            key={`${keyPrefix}-line-${lineIndex}-url-${match.index}`}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brandBlue underline underline-offset-2"
          >
            {formatUrlLabel(safeUrl)}
          </a>
        );
        cursor = match.index + rawUrl.length;
      }

      if (cursor < chunk.length) {
        lineNodes.push(
          <span
            key={`${keyPrefix}-line-${lineIndex}-tail`}
            dangerouslySetInnerHTML={{ __html: formatInlineMarkup(chunk.slice(cursor)) }}
          />
        );
      }

      nodes.push(<span key={`${keyPrefix}-line-${lineIndex}`}>{lineNodes}</span>);
    });
    return nodes;
  }, []);

  const renderTextWithMentions = useCallback((value: string, storedEntries: MentionEntry[] | undefined, keyPrefix: string) => {
    const mentionEntries = (storedEntries && storedEntries.length > 0 ? storedEntries : buildFallbackMentionEntries(value))
      .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.end <= value.length)
      .sort((a, b) => a.start - b.start);

    if (mentionEntries.length === 0) {
      return renderFormattedText(value, keyPrefix);
    }

    const nodes: ReactNode[] = [];
    let cursor = 0;

    mentionEntries.forEach((entry, index) => {
      if (entry.start > cursor) {
        nodes.push(...renderFormattedText(value.slice(cursor, entry.start), `${keyPrefix}-text-${index}`));
      }
      const label = value.slice(entry.start, entry.end);
      nodes.push(
        <button
          key={`${keyPrefix}-mention-${index}-${entry.mentionedUserId}`}
          type="button"
          onClick={() => openProfile(entry.mentionedUserId, label)}
          className="inline font-medium text-brandBlue underline-offset-2 hover:underline"
        >
          {label}
        </button>
      );
      cursor = entry.end;
    });

    if (cursor < value.length) {
      nodes.push(...renderFormattedText(value.slice(cursor), `${keyPrefix}-tail`));
    }

    return nodes;
  }, [buildFallbackMentionEntries, openProfile, renderFormattedText]);

  const renderComposerTextWithMentions = useCallback((
    value: string,
    storedEntries: MentionEntry[] | undefined,
    placeholder: string,
    keyPrefix: string
  ) => {
    if (!value) {
      return <span className="text-[var(--text-tertiary)]">{placeholder}</span>;
    }

    const mentionEntries = (storedEntries && storedEntries.length > 0 ? storedEntries : buildFallbackMentionEntries(value))
      .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.end <= value.length)
      .sort((a, b) => a.start - b.start);

    if (mentionEntries.length === 0) {
      return <span className="text-foreground whitespace-pre-wrap break-words">{value}</span>;
    }

    const nodes: ReactNode[] = [];
    let cursor = 0;

    mentionEntries.forEach((entry, index) => {
      if (entry.start > cursor) {
        nodes.push(
          <span key={`${keyPrefix}-plain-${index}`} className="text-foreground whitespace-pre-wrap break-words">
            {value.slice(cursor, entry.start)}
          </span>
        );
      }
      nodes.push(
        <span key={`${keyPrefix}-mention-${index}`} className="font-medium text-brandBlue whitespace-pre-wrap break-words">
          {value.slice(entry.start, entry.end)}
        </span>
      );
      cursor = entry.end;
    });

    if (cursor < value.length) {
      nodes.push(
        <span key={`${keyPrefix}-tail`} className="text-foreground whitespace-pre-wrap break-words">
          {value.slice(cursor)}
        </span>
      );
    }

    return nodes;
  }, [buildFallbackMentionEntries]);

  const handleCreateNotice = async () => {
    if (isSocialPostingBlocked) {
      setSocialRestrictionModalOpen(true);
      return;
    }
    const composedContent = (() => {
      const base = content.trim();
      if (!lockedPreviewUrl || dismissedPreviewUrls.has(lockedPreviewUrl)) return base;
      if (base.includes(lockedPreviewUrl)) return base;
      return base ? `${base}\n\n${lockedPreviewUrl}` : lockedPreviewUrl;
    })();
    const nextErrors: { title?: string; content?: string } = {};
    if (!title.trim()) nextErrors.title = t("Title is required");
    if (!composedContent.trim()) nextErrors.content = t("Content is required");
    if (createWordsUsed > MAX_COMPOSER_WORDS) nextErrors.content = t("Thread content is too long");
    setCreateErrors(nextErrors);
    if (!user || Object.keys(nextErrors).length > 0) {
      return;
    }

    setCreating(true);
    let pendingVideoCleanup: SocialVideoMetadata | null = null;

    try {
      if (editingNoticeId) {
        const editingNotice = notices.find((item) => item.id === editingNoticeId);
        if (editingNotice?.provider_video_id && createMediaFiles.some((item) => item.kind === "video")) {
          throw new Error("Only one video can be added to a post.");
        }
        const existingImages = Array.isArray(editingNotice?.images)
          ? editingNotice.images.filter((url): url is string => typeof url === "string" && url.length > 0)
          : [];
        const uploadedUrls = await uploadComposerMedia(createMediaFiles, "thread");
        const uploadedVideo = await uploadCreateVideo(createMediaFiles);
        pendingVideoCleanup = uploadedVideo;
        const mergedImages = [...existingImages, ...uploadedUrls];
        const { data: updatedThread, error } = await supabase
          .from("threads" as "profiles")
          .update({
            title: title.trim(),
            content: composedContent,
            tags: [category],
            images: mergedImages,
            is_sensitive: createIsSensitive,
            ...(uploadedVideo
              ? {
                  video_provider: uploadedVideo.provider,
                  provider_video_id: uploadedVideo.providerVideoId,
                  video_playback_url: uploadedVideo.playbackUrl,
                  video_embed_url: uploadedVideo.embedUrl,
                  video_thumbnail_url: uploadedVideo.thumbnailUrl,
                  video_preview_url: uploadedVideo.previewUrl,
                  video_duration_seconds: uploadedVideo.duration,
                  video_status: uploadedVideo.status,
                }
              : {}),
          } as Record<string, unknown>)
          .eq("id", editingNoticeId)
          .eq("user_id", user.id)
          .select("id, title, content, tags, hashtags, images, map_id, likes, created_at, user_id")
          .single();
        if (error) throw error;

        if (updatedThread) {
          setNotices((prev) =>
            prev.map((item) =>
              item.id === editingNoticeId
                ? {
                    ...item,
                    title: String(updatedThread.title ?? ""),
                    content: String(updatedThread.content ?? ""),
                    tags: (updatedThread.tags as string[] | null) ?? null,
                    hashtags: (updatedThread.hashtags as string[] | null) ?? null,
                    images: (updatedThread.images as string[] | null) ?? item.images ?? null,
                    map_id: (updatedThread.map_id as string | null) ?? item.map_id ?? null,
                    alert_type: item.alert_type ?? null,
                    is_sensitive: createIsSensitive,
                    ...(uploadedVideo
                      ? {
                          video_provider: uploadedVideo.provider,
                          provider_video_id: uploadedVideo.providerVideoId,
                          video_playback_url: uploadedVideo.playbackUrl,
                          video_embed_url: uploadedVideo.embedUrl,
                          video_thumbnail_url: uploadedVideo.thumbnailUrl,
                          video_preview_url: uploadedVideo.previewUrl,
                          video_duration_seconds: uploadedVideo.duration,
                          video_status: uploadedVideo.status,
                        }
                      : {}),
                  }
                : item
            )
          );
          if (uploadedVideo) {
            await attachSocialVideoToThread(uploadedVideo, String(updatedThread.id));
            pendingVideoCleanup = null;
          }

          {
            const { error: deleteMentionsError } = await supabase
              .from("post_mentions" as never)
              .delete()
              .eq("post_id", String(updatedThread.id));
            if (deleteMentionsError) {
              console.error("[social.mentions.clear_failed]", deleteMentionsError);
            }
          }

          const finalMentions = await resolveMentionsFromText(String(updatedThread.content ?? ""), createMentions);
          if (finalMentions.length > 0) {
            await persistPostMentions(String(updatedThread.id), finalMentions);
            await createMentionNotifications(
              String(updatedThread.id),
              Array.from(new Set(finalMentions.map((entry) => entry.mentionedUserId)))
            );
          }
        }

        toast.success(t("Post updated"));
      } else {
        const uploadedUrls = await uploadComposerMedia(createMediaFiles, "thread");
        const uploadedVideo = await uploadCreateVideo(createMediaFiles);
        pendingVideoCleanup = uploadedVideo;

        const { data: createdThread, error } = await supabase
          .from("threads" as "profiles")
          .insert({
            user_id: user.id,
            title: title.trim(),
            content: composedContent,
            tags: [category],
            hashtags: [],
            images: uploadedUrls,
            likes: 0,
            is_sensitive: createIsSensitive,
            ...(uploadedVideo
              ? {
                  video_provider: uploadedVideo.provider,
                  provider_video_id: uploadedVideo.providerVideoId,
                  video_playback_url: uploadedVideo.playbackUrl,
                  video_embed_url: uploadedVideo.embedUrl,
                  video_thumbnail_url: uploadedVideo.thumbnailUrl,
                  video_preview_url: uploadedVideo.previewUrl,
                  video_duration_seconds: uploadedVideo.duration,
                  video_status: uploadedVideo.status,
                }
              : {}),
          } as Record<string, unknown>)
          .select("id, title, content, tags, hashtags, images, map_id, likes, created_at, user_id")
          .single();

        if (error) throw error;

        if (createdThread) {
          const optimisticThread: Thread = {
            id: String(createdThread.id),
            title: String(createdThread.title ?? ""),
            content: String(createdThread.content ?? ""),
            tags: (createdThread.tags as string[] | null) ?? null,
            hashtags: (createdThread.hashtags as string[] | null) ?? null,
            images: (createdThread.images as string[] | null) ?? null,
            map_id: (createdThread.map_id as string | null) ?? null,
            alert_type: null,
            likes: Number(createdThread.likes ?? 0),
            created_at: String(createdThread.created_at),
            user_id: String(createdThread.user_id),
            is_sensitive: createIsSensitive,
            ...(uploadedVideo
              ? {
                  video_provider: uploadedVideo.provider,
                  provider_video_id: uploadedVideo.providerVideoId,
                  video_playback_url: uploadedVideo.playbackUrl,
                  video_embed_url: uploadedVideo.embedUrl,
                  video_thumbnail_url: uploadedVideo.thumbnailUrl,
                  video_preview_url: uploadedVideo.previewUrl,
                  video_duration_seconds: uploadedVideo.duration,
                  video_status: uploadedVideo.status,
                }
              : {}),
            author: {
              display_name: profile?.display_name || "You",
              avatar_url: profile?.avatar_url || null,
              verification_status: profile?.verification_status || null,
              is_verified: profile?.is_verified === true,
            },
          };
          setNotices((prev) => [optimisticThread, ...prev.filter((item) => item.id !== optimisticThread.id)]);
          if (uploadedVideo) {
            await attachSocialVideoToThread(uploadedVideo, String(createdThread.id));
            pendingVideoCleanup = null;
          }
          const finalMentions = await resolveMentionsFromText(String(createdThread.content ?? ""), createMentions);
          if (finalMentions.length > 0) {
            await persistPostMentions(String(createdThread.id), finalMentions);
            await createMentionNotifications(
              String(createdThread.id),
              Array.from(new Set(finalMentions.map((entry) => entry.mentionedUserId)))
            );
          }
        }

        toast.success(t("Thread posted!"));
      }

      setTitle("");
      setContent("");
      setLockedPreviewUrl(null);
      setDismissedPreviewUrls(new Set());
      setCreateMentions([]);
      setCreateMentionQuery(null);
      setCreateMentionSuggestions([]);
      setCategory("Social");
      revokeComposerMedia(createMediaFiles);
      setCreateMediaFiles([]);
      setCreateIsSensitive(false);
      setCreateSensitiveSuggested(false);
      setEditingNoticeId(null);
      setIsCreateOpen(false);
      setCreateErrors({});
      void fetchNotices(true);
    } catch (error: unknown) {
      if (pendingVideoCleanup?.providerVideoId) {
        void deleteSocialVideo(pendingVideoCleanup.providerVideoId);
      }
      toast.error(getErrorMessage(error, t("Failed to post notice")));
    } finally {
      setCreating(false);
    }
  };

  // SPRINT 3: Toggle like with green (#22c55e) state
  const handleSupport = (noticeId: string) => {
    const target = notices.find((item) => item.id === noticeId);
    if (target?.user_id && user?.id) {
      // blockedUsers is already loaded in state; no need for an async round-trip per like.
      if (blockedUsers.has(target.user_id)) {
        toast.error("You cannot support this user.");
        return;
      }
      void (async () => {
        const isRemoving = likedNotices.has(noticeId);
        const delta = isRemoving ? -1 : 1;
        setLikedNotices((prev) => {
          const next = new Set(prev);
          if (isRemoving) next.delete(noticeId);
          else next.add(noticeId);
          return next;
        });
        setNotices((prev) =>
          prev.map((item) =>
            item.id === noticeId ? { ...item, likes: Math.max(0, Number(item.likes ?? 0) + delta) } : item
          )
        );
        if (isRemoving) {
          const { error: removeErr } = await supabase
            .from("thread_supports" as "profiles")
            .delete()
            .eq("thread_id", noticeId)
            .eq("user_id", user.id);
          if (removeErr) {
            toast.error(removeErr.message || "Unable to update support.");
            void fetchNotices(true);
            return;
          }
        } else {
          const { error: addErr } = await supabase.from("thread_supports" as "profiles").insert({
            thread_id: noticeId,
            user_id: user.id,
          });
          if (addErr) {
            const code = String((addErr as { code?: string }).code || "");
            const message = String((addErr as { message?: string }).message || "").toLowerCase();
            if (code === "23505" || message.includes("duplicate") || message.includes("conflict")) {
              setLikedNotices((prev) => {
                const next = new Set(prev);
                next.add(noticeId);
                return next;
              });
            } else {
              toast.error(addErr.message || "Unable to update support.");
            }
            void fetchNotices(true);
            return;
          }
        }

        const { count } = await supabase
          .from("thread_supports" as "profiles")
          .select("id", { count: "exact", head: true })
          .eq("thread_id", noticeId);
        const resolvedCount = Number(count ?? 0);
        setNotices((prev) => prev.map((item) => (item.id === noticeId ? { ...item, likes: resolvedCount } : item)));
	        if (!isRemoving && target.user_id !== user.id) {
	          await upsertNotificationWindow({
            ownerUserId: target.user_id,
            subjectId: noticeId,
            subjectType: "thread",
            kind: "like",
            category: "social",
            href: `/social?focus=${noticeId}`,
            actorId: user.id,
            actorName: profile?.display_name || "Someone",
          });
	        }
        if (!isRemoving) {
          void recordSocialFeedEvent(noticeId, "like");
        }
	        toast.success(isRemoving ? t("Support removed") : t("Thanks for your support!"));
	      })();
	      return;
    }
    setLikedNotices(prev => {
      const newLiked = new Set(prev);
      if (newLiked.has(noticeId)) {
        newLiked.delete(noticeId);
        toast.success(t("Support removed"));
      } else {
        newLiked.add(noticeId);
        toast.success(t("Thanks for your support!"));
      }
      return newLiked;
    });
  };

  const openReportModal = useCallback((targetUserId: string | null, targetName: string | null) => {
    if (!targetUserId || !user?.id) return;
    void (async () => {
      const blocked = await areUsersBlocked(user.id, targetUserId);
      if (blocked) {
        toast.error("You cannot report this user from here.");
        return;
      }
      setReportTargetUserId(targetUserId);
      setReportTargetName(targetName?.trim() || "User");
      setReportOpen(true);
    })();
  }, [user?.id]);

  const handleReport = (noticeId: string) => {
    const target = notices.find((item) => item.id === noticeId);
    openReportModal(target?.user_id ?? null, target?.author?.display_name ?? null);
  };

  const handleHide = (noticeId: string) => {
    setHiddenNotices(prev => new Set([...prev, noticeId]));
    void recordSocialFeedEvent(noticeId, "hide");
    toast.success(t("Thread hidden"));
  };

  const handleHideComment = (commentId: string) => {
    setHiddenComments((prev) => new Set([...prev, commentId]));
    toast.success(t("Reply hidden"));
  };

  const handleEditComment = async (threadId: string, comment: ThreadComment) => {
    if (!user?.id || comment.user_id !== user.id) return;
    const nextContent = window.prompt(t("Edit reply"), comment.content || "");
    if (nextContent === null) return;
    const trimmed = nextContent.trim();
    if (!trimmed) {
      toast.error(t("Reply cannot be empty"));
      return;
    }
    if (countWords(trimmed) > MAX_COMPOSER_WORDS) {
      toast.error(t("Reply is too long"));
      return;
    }

    const { error } = await supabase
      .from("thread_comments" as "profiles")
      .update({ content: trimmed, text: trimmed } as Record<string, unknown>)
      .eq("id", comment.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message || t("Unable to edit reply"));
      return;
    }

    setCommentsByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).map((entry) =>
        entry.id === comment.id ? { ...entry, content: trimmed } : entry
      ),
    }));
    toast.success(t("Reply updated"));
  };

  const handleDeleteComment = async (threadId: string, comment: ThreadComment) => {
    if (!user?.id || comment.user_id !== user.id) return;
    const confirmed = window.confirm(t("Delete this reply permanently?"));
    if (!confirmed) return;

    const { error } = await supabase
      .from("thread_comments" as "profiles")
      .delete()
      .eq("id", comment.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message || t("Unable to delete reply"));
      return;
    }

    setCommentsByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] || []).filter((entry) => entry.id !== comment.id),
    }));
    setNotices((prev) =>
      prev.map((notice) =>
        notice.id === threadId
          ? { ...notice, comment_count: Math.max(0, Number(notice.comment_count ?? 0) - 1) }
          : notice
      )
    );
    toast.success(t("Reply deleted"));
  };

  const handleBlockUser = async (authorId: string) => {
    const relatedNotice = notices.find((notice) => notice.user_id === authorId);
    const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
      "block_user",
      { p_blocked_id: authorId }
    );
    if (error) {
      toast.error(error.message || "Unable to block user right now");
      return;
    }
    setBlockedUsers(prev => new Set([...prev, authorId]));
    setNotices((prev) => prev.filter((notice) => notice.user_id !== authorId));
    setCommentsByThread((prev) => {
      const next: Record<string, ThreadComment[]> = {};
      for (const [threadId, comments] of Object.entries(prev)) {
        next[threadId] = comments.filter((comment) => comment.user_id !== authorId);
      }
      return next;
    });
    if (relatedNotice?.id) {
      void recordSocialFeedEvent(relatedNotice.id, "block");
    }
    void fetchNotices(true);
    toast.success(t("You won't see posts from this user"));
  };

  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const socialPinsKey = useMemo(() => `huddle_social_pins:${profile?.id || "anon"}`, [profile?.id]);
  const socialSavesKey = useMemo(() => `huddle_social_saves:${profile?.id || "anon"}`, [profile?.id]);
  const [pinnedNotices, setPinnedNotices] = useState<Set<string>>(new Set());
  const [savedNotices, setSavedNotices] = useState<Set<string>>(new Set());
  const getTagStyle = (tag: string, threadId: string) => {
    if (String(tag).toLowerCase() !== "news") return "bg-primary text-white border border-primary";
    const notice = notices.find((item) => item.id === threadId);
    const type = notice ? getDerivedAlertType(notice) : newsAlertTypeByThread[threadId];
    if (type === "Lost") return "bg-red-500 text-white border border-red-500";
    if (type === "Caution") return "bg-[#2145CF] text-white border border-[#2145CF]";
    if (type === "Stray") return "bg-yellow-400 text-black border border-yellow-400";
    return "bg-[#A1A4A9] text-white border border-[#A1A4A9]";
  };

  const getPrimaryTag = (notice: Thread) => {
    const rowTags = notice.tags || [];
    const hasNewsTag = rowTags.some((tag) => String(tag).toLowerCase() === "news");
    const isAlertDerived = Boolean(notice.alert_type || newsAlertTypeByThread[notice.id]);
    const displayTags = hasNewsTag ? rowTags.slice(0, 1) : isAlertDerived ? ["News"] : rowTags.slice(0, 1);
    return displayTags[0] || null;
  };

  const loadCommentsForThread = useCallback(
    async (threadId: string) => {
      if (!threadId || commentsLoadingThreads.has(threadId)) return;

      setCommentsLoadingThreads((prev) => new Set([...prev, threadId]));
      setCommentLoadErrors((prev) => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });

      try {
        const { data, error } = await supabase
          .from("thread_comments" as "profiles")
          .select(`
            id,
            thread_id,
            parent_comment_id,
            content,
            images,
            created_at,
            user_id,
            author:profiles!thread_comments_user_id_fkey(display_name, social_id, avatar_url)
          `)
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        const comments = (((data || []) as unknown) as Array<Record<string, unknown>>).map((comment) => {
          const authorObj = Array.isArray(comment.author) ? comment.author[0] : comment.author;
          return {
            id: String(comment.id),
            thread_id: String(comment.thread_id || threadId),
            parent_comment_id: typeof comment.parent_comment_id === "string" ? comment.parent_comment_id : null,
            content: String(comment.content || ""),
            images: (comment.images as string[] | null) ?? null,
            created_at: String(comment.created_at || new Date().toISOString()),
            user_id: String(comment.user_id || ""),
            author:
              typeof authorObj === "object" && authorObj !== null
                ? {
                    display_name: ((authorObj as Record<string, unknown>).display_name as string | null) ?? null,
                    social_id: ((authorObj as Record<string, unknown>).social_id as string | null) ?? null,
                    avatar_url: ((authorObj as Record<string, unknown>).avatar_url as string | null) ?? null,
                  }
                : null,
          } as ThreadComment;
        });

        setCommentsByThread((prev) => ({ ...prev, [threadId]: comments }));
        setNotices((prev) =>
          prev.map((notice) =>
            notice.id === threadId && comments.length > Number(notice.comment_count ?? 0)
              ? { ...notice, comment_count: comments.length }
              : notice
          )
        );

        setCommentsLoadingThreads((prev) => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });

        void (async () => {
          const commentIds = comments.map((comment) => comment.id).filter(Boolean);
          if (commentIds.length > 0) {
            const { data: mentionRows, error: mentionError } = await supabase
              .from("reply_mentions" as never)
              .select("reply_id, mentioned_user_id, start_idx, end_idx, social_id_at_time")
              .in("reply_id", commentIds)
              .order("start_idx", { ascending: true });

            if (mentionError) {
              console.error("[social.comments.mentions_load_failed]", { threadId, error: mentionError.message });
            } else {
              const nextMentions: Record<string, MentionEntry[]> = {};
              (((mentionRows || []) as unknown) as Array<Record<string, unknown>>).forEach((row) => {
                const replyId = String(row.reply_id || "");
                if (!replyId) return;
                nextMentions[replyId] = [
                  ...(nextMentions[replyId] || []),
                  {
                    start: Number(row.start_idx ?? 0),
                    end: Number(row.end_idx ?? 0),
                    mentionedUserId: String(row.mentioned_user_id || ""),
                    socialIdAtTime: String(row.social_id_at_time || ""),
                  },
                ];
              });
              setReplyMentionsById((prev) => ({ ...prev, ...nextMentions }));
            }
          }

          await primeMentionDirectory(comments.map((comment) => comment.content || ""));
        })();
      } catch (error) {
        console.error("[social.comments.load_failed]", { threadId, error });
        setCommentLoadErrors((prev) => ({
          ...prev,
          [threadId]: "Comments could not load. Please try again.",
        }));
      } finally {
        setCommentsLoadingThreads((prev) => {
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
      }
    },
    [commentsLoadingThreads, primeMentionDirectory]
  );

  const openCommentsForThread = useCallback(
    (notice: Thread) => {
      if (expandedReplies.has(notice.id)) {
        setExpandedReplies((prev) => {
          const next = new Set(prev);
          next.delete(notice.id);
          return next;
        });
        if (replyFor === notice.id) {
          setReplyFor(null);
          resetReplyComposerDraft();
        }
        return;
      }

      setExpandedReplies((prev) => new Set([...prev, notice.id]));
      void recordSocialFeedEvent(notice.id, "open_comments");
      if (commentsByThreadRef.current[notice.id] === undefined) {
        void loadCommentsForThread(notice.id);
      }
      if (isSocialPostingBlocked) {
        setSocialRestrictionModalOpen(true);
        return;
      }

      setReplyFor(notice.id);
      resetReplyComposerDraft();
      setReplyTargetCommentId(null);
      snapToCommentArea(notice.id, "composer", true);
    },
    [
      expandedReplies,
      isSocialPostingBlocked,
      loadCommentsForThread,
      recordSocialFeedEvent,
      replyFor,
      resetReplyComposerDraft,
      snapToCommentArea,
    ]
  );

  const replyToComment = useCallback(
    (notice: Thread, comment: ThreadComment) => {
      if (isSocialPostingBlocked) {
        setSocialRestrictionModalOpen(true);
        return;
      }

      if (replyFor === notice.id && replyTargetCommentId === comment.id) {
        setReplyFor(null);
        resetReplyComposerDraft();
        return;
      }

      setExpandedReplies((prev) => new Set([...prev, notice.id]));
      setReplyFor(notice.id);
      resetReplyComposerDraft();
      setReplyTargetCommentId(comment.id);

      snapToCommentArea(notice.id, "composer", true);
    },
    [isSocialPostingBlocked, replyFor, replyTargetCommentId, resetReplyComposerDraft, snapToCommentArea]
  );

  const formatTimeAgo = (date: string) => {
    if (!date) return t("Just now");
    const now = new Date();
    const then = new Date(date);
    if (Number.isNaN(then.getTime())) return t("Just now");
    const diff = now.getTime() - then.getTime();
    if (diff < 60 * 1000) return t("Just now");
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  const renderMentionSuggestions = useCallback((
    suggestions: MentionSuggestion[],
    onSelect: (suggestion: MentionSuggestion) => void,
    className?: string
  ) => {
    if (suggestions.length === 0) return null;
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-white/95 shadow-[0_10px_30px_rgba(35,45,90,0.08)]", className)}>
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.userId}-${suggestion.socialId}`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(suggestion)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {suggestion.avatarUrl ? (
                <img src={suggestion.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-brandText/70">
                  {suggestion.displayName.charAt(0) || suggestion.socialId.charAt(0) || "U"}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-brandText">
                {suggestion.displayName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                @{suggestion.socialId}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }, []);

  const openShareSheet = useCallback((notice: Thread) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const firstImage = Array.isArray(notice.images)
      ? notice.images.find((entry) => typeof entry === "string" && entry.trim().length > 0) || null
      : null;
    setSharePayload(
      buildShareModel({
        origin,
        contentType: "thread",
        contentId: notice.id,
        surface: "Social",
        displayName: notice.author?.display_name,
        socialId: notice.author?.social_id,
        contentSnippet: notice.content,
        imagePath: firstImage,
        nativeShareText: String(notice.title || "").trim() || undefined,
      }),
    );
    setShareOpen(true);
  }, []);

  const recordShareClick = useCallback(async (threadId: string) => {
    if (!threadId) return;

    setNotices((prev) =>
      prev.map((notice) =>
        notice.id === threadId
          ? { ...notice, share_count: Math.max(0, Number(notice.share_count ?? 0) + 1) }
          : notice
      )
    );

    try {
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "record_thread_share_click",
        { p_thread_id: threadId }
      );
      if (error) return;
      void recordSocialFeedEvent(threadId, "share");
      if (typeof data === "number") {
        setNotices((prev) =>
          prev.map((notice) =>
            notice.id === threadId
              ? { ...notice, share_count: Math.max(0, Number(data)) }
              : notice
          )
        );
      }
    } catch {
      void recordSocialFeedEvent(threadId, "share");
      // Keep optimistic count if RPC is unavailable.
    }
  }, [recordSocialFeedEvent]);

  const toggleSavedNotice = useCallback((noticeId: string) => {
    setSavedNotices((prev) => {
      const next = new Set(prev);
      const willSave = !next.has(noticeId);
      if (willSave) next.add(noticeId);
      else next.delete(noticeId);
      if (willSave) {
        void recordSocialFeedEvent(noticeId, "save");
      }
      return next;
    });
  }, [recordSocialFeedEvent]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(socialPinsKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setPinnedNotices(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setPinnedNotices(new Set());
    }
  }, [socialPinsKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(socialSavesKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setSavedNotices(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setSavedNotices(new Set());
    }
  }, [socialSavesKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(socialPinsKey, JSON.stringify(Array.from(pinnedNotices))); } catch (_) { /* ignore storage errors */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pinnedNotices, socialPinsKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(socialSavesKey, JSON.stringify(Array.from(savedNotices))); } catch (_) { /* ignore storage errors */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [savedNotices, socialSavesKey]);

  const visibleNotices = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const base = notices.filter(notice =>
      !hiddenNotices.has(notice.id) &&
      !blockedUsers.has(notice.user_id) &&
      (notice.author?.non_social !== true)
    );
    const topicFiltered = topicFilters.length === 0
      ? base
      : base.filter((notice) => topicFilters.some((t) => (notice.tags || []).includes(t)));
    const filtered = (sortMode === "Saves" ? topicFiltered.filter((notice) => savedNotices.has(notice.id)) : topicFiltered).filter((notice) => {
      if (!normalizedSearch) return true;
      const comments = commentsByThread[notice.id] || [];
      const searchable = [
        notice.title,
        notice.content,
        notice.author?.display_name || "",
        ...(notice.tags || []),
        ...(notice.hashtags || []),
        ...comments.map((c) => c.content || ""),
        ...comments.map((c) => c.author?.display_name || ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
    return [...filtered].sort((a, b) => {
      const aPinned = pinnedNotices.has(a.id);
      const bPinned = pinnedNotices.has(b.id);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (sortMode === "Trending") {
        const scoreA = Number(a.score ?? 0);
        const scoreB = Number(b.score ?? 0);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (createdDiff !== 0) return createdDiff;
      if (a.id === b.id) return 0;
      return b.id.localeCompare(a.id);
    });
  }, [blockedUsers, commentsByThread, hiddenNotices, notices, pinnedNotices, savedNotices, searchQuery, sortMode, topicFilters]);

  // Stable key for visibleNotices (defined here because visibleNotices itself
  // is computed in the memo just above this point).
  // noticeIdsKey is hoisted earlier in the file, near the noticesRef sync,
  // because the likedNotices effect needs it before this memo position.
  const visibleNoticeIdsKey = useMemo(
    () => visibleNotices.map((n) => n.id).join(","),
    [visibleNotices]
  );
  const visibleNoticesRef = useRef(visibleNotices);
  useEffect(() => { visibleNoticesRef.current = visibleNotices; }, [visibleNotices]);

  const createContentFirstUrl = useMemo(() => {
    const u = extractFirstHttpUrl(content || "");
    return u && !dismissedPreviewUrls.has(u) ? u : null;
  }, [content, dismissedPreviewUrls]);
  const activePreviewUrl = lockedPreviewUrl && !dismissedPreviewUrls.has(lockedPreviewUrl)
    ? lockedPreviewUrl
    : createContentFirstUrl;
  const createContentPreview = activePreviewUrl ? linkPreviewByUrl[activePreviewUrl] : null;
  const dismissCreatePreview = useCallback((url: string) => {
    setDismissedPreviewUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
    setLockedPreviewUrl((cur) => (cur === url ? null : cur));
  }, []);
  // Twitter-style: once a preview resolves, lock it as the active preview and
  // strip the raw URL from the textarea so the post body stays clean.
  useEffect(() => {
    if (!createContentFirstUrl) return;
    const preview = linkPreviewByUrl[createContentFirstUrl];
    if (!preview?.resolved || preview.failed) return;
    setLockedPreviewUrl(createContentFirstUrl);
    setContent((prev) => {
      if (!prev.includes(createContentFirstUrl)) return prev;
      return prev.replace(createContentFirstUrl, "").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
    });
  }, [createContentFirstUrl, linkPreviewByUrl]);
  const COLLAPSED_CONTENT_MAX_HEIGHT = 120;

  useEffect(() => {
    linkPreviewMapRef.current = linkPreviewByUrl;
  }, [linkPreviewByUrl]);

  const updateLinkPreviewEntry = useCallback((url: string, preview: LinkPreview) => {
    linkPreviewAccessRef.current.set(url, Date.now());
    setLinkPreviewByUrl((prev) =>
      trimLinkPreviewState(
        {
          ...prev,
          [url]: preview,
        },
        linkPreviewAccessRef.current,
      ),
    );
  }, []);

  const persistLinkPreviewToLocalCache = useCallback((url: string, preview: LinkPreview) => {
    if (!(preview.title || preview.description || preview.image || preview.siteName)) return;
    const stored = loadStoredLinkPreviewMap();
    stored[url] = {
      url,
      title: preview.title,
      description: preview.description,
      image: preview.image,
      siteName: preview.siteName,
      fetchedAt: Date.now(),
    };
    const sorted = Object.entries(stored)
      .sort(([, left], [, right]) => right.fetchedAt - left.fetchedAt)
      .slice(0, LINK_PREVIEW_LRU_LIMIT);
    saveStoredLinkPreviewMap(Object.fromEntries(sorted));
  }, []);

  // Gate on visibleNoticeIdsKey (stable string of IDs) so this effect does not re-run when
  // in-place properties (like counts, comment counts) change — only when the visible set changes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const notices = visibleNoticesRef.current;
      const next: Record<string, boolean> = {};
      notices.forEach((notice) => {
        const node = contentRefs.current[notice.id];
        if (!node) {
          next[notice.id] = false;
          return;
        }
        next[notice.id] = node.scrollHeight > COLLAPSED_CONTENT_MAX_HEIGHT + 2;
      });
      setExpandableContentById(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleNoticeIdsKey, threadMentionsById]);

  useEffect(() => {
    const notices = visibleNoticesRef.current;
    if (notices.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const dwellTimeouts = dwellTimeoutsRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const node = entry.target as HTMLDivElement;
          const threadId = node.dataset.threadId;
          if (!threadId) return;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (!trackedImpressionsRef.current.has(threadId)) {
              trackedImpressionsRef.current.add(threadId);
              void recordSocialFeedEvent(threadId, "impression");
            }
            if (!trackedDwellRef.current.has(threadId) && !dwellTimeouts.has(threadId)) {
              const timeoutId = window.setTimeout(() => {
                dwellTimeouts.delete(threadId);
                if (trackedDwellRef.current.has(threadId)) return;
                trackedDwellRef.current.add(threadId);
                void recordSocialFeedEvent(threadId, "dwell_10s");
              }, 10000);
              dwellTimeouts.set(threadId, timeoutId);
            }
            return;
          }

          const timeoutId = dwellTimeouts.get(threadId);
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            dwellTimeouts.delete(threadId);
          }
        });
      },
      { threshold: [0.6] },
    );

    notices.forEach((notice) => {
      const node = threadRefs.current[notice.id];
      if (node) observer.observe(node);
    });

    return () => {
      observer.disconnect();
      dwellTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      dwellTimeouts.clear();
    };
  }, [recordSocialFeedEvent, visibleNoticeIdsKey]);

  const fetchLinkPreview = useCallback(async (url: string) => {
    const existing = linkPreviewMapRef.current[url];
    if (existing && (existing.loading || existing.resolved)) return;
    if (linkPreviewInFlightRef.current.has(url)) return;
    const intrinsicPreview = buildIntrinsicLinkPreview(url);
    if (intrinsicPreview) {
      updateLinkPreviewEntry(url, intrinsicPreview);
      persistLinkPreviewToLocalCache(url, intrinsicPreview);
      return;
    }
    linkPreviewInFlightRef.current.add(url);
    updateLinkPreviewEntry(url, {
      ...(existing || { url }),
      url,
      loading: true,
      failed: false,
      resolved: false,
      error: undefined,
    });
    if (import.meta.env.DEV) {
      console.debug("[link-preview] fetch:start", { url });
    }

    try {
      const invokePromise = (async () => {
        const { data, error } = await supabase.functions.invoke("link-preview", {
          body: { url },
        });
        return {
          data: (data as LinkPreviewPayload | null) ?? null,
          error: error ? new Error(error.message) : null,
        };
      })();
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error("preview_timeout") }), 7000)
      );
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
      if (error || !data || typeof data !== "object") {
        const reason = error?.message || "invalid_payload";
        if (import.meta.env.DEV) {
          console.debug("[link-preview] fetch:failed", { url, reason });
        }
        updateLinkPreviewEntry(url, buildFallbackLinkPreview(url, reason));
        return;
      }
      const payload = data as LinkPreviewPayload;
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const description = typeof payload.description === "string" ? payload.description.trim() : "";
      const image = typeof payload.image === "string" ? payload.image.trim() : "";
      const siteName = typeof payload.siteName === "string" ? payload.siteName.trim() : "";
      const remoteFailed = payload.failed === true;
      const hasMetadata = Boolean(title || description || image || siteName);
      if (remoteFailed || !hasMetadata) {
        const reason = remoteFailed ? "edge_marked_failed" : "empty_metadata";
        if (import.meta.env.DEV) {
          console.debug("[link-preview] fetch:empty", { url, reason, payload });
        }
        updateLinkPreviewEntry(url, buildFallbackLinkPreview(url, reason));
        return;
      }
      if (import.meta.env.DEV) {
        console.debug("[link-preview] fetch:success", {
          url,
          title,
          hasDescription: Boolean(description),
          hasImage: Boolean(image),
          siteName,
        });
      }
      const resolved = {
        url,
        title: title || undefined,
        description: description || undefined,
        image: image || undefined,
        siteName: siteName || undefined,
        loading: false,
        failed: false,
        resolved: true,
        error: undefined,
      };
      updateLinkPreviewEntry(url, resolved);
      persistLinkPreviewToLocalCache(url, resolved);
      void (supabase.from("link_preview_cache" as "profiles") as unknown as {
        upsert: (row: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<unknown>;
      }).upsert(
        { url_hash: url.toLowerCase(), url, payload: { title, description, image, siteName }, fetched_at: new Date().toISOString() },
        { onConflict: "url_hash" }
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unexpected_error";
      if (import.meta.env.DEV) {
        console.debug("[link-preview] fetch:exception", { url, reason, err });
      }
      updateLinkPreviewEntry(url, buildFallbackLinkPreview(url, reason));
    } finally {
      linkPreviewInFlightRef.current.delete(url);
    }
  }, [persistLinkPreviewToLocalCache, updateLinkPreviewEntry]);

  const processLinkPreviewQueue = useCallback(() => {
    while (
      linkPreviewActiveCountRef.current < LINK_PREVIEW_QUEUE_LIMIT &&
      linkPreviewQueueRef.current.length > 0
    ) {
      const nextUrl = linkPreviewQueueRef.current.shift();
      if (!nextUrl) continue;
      linkPreviewQueuedRef.current.delete(nextUrl);
      linkPreviewActiveCountRef.current += 1;
      void fetchLinkPreview(nextUrl).finally(() => {
        linkPreviewActiveCountRef.current = Math.max(0, linkPreviewActiveCountRef.current - 1);
        processLinkPreviewQueue();
      });
    }
  }, [fetchLinkPreview]);

  const ensureLinkPreview = useCallback(async (url: string) => {
    if (!url) return;
    const existing = linkPreviewMapRef.current[url];
    if (existing && (existing.loading || existing.resolved)) return;
    if (linkPreviewInFlightRef.current.has(url) || linkPreviewQueuedRef.current.has(url)) return;
    linkPreviewQueuedRef.current.add(url);
    linkPreviewQueueRef.current.push(url);
    processLinkPreviewQueue();
  }, [processLinkPreviewQueue]);

  // Use visibleNoticesRef so this effect only re-fires when IDs change, not on in-place updates.
  useEffect(() => {
    const urls = Array.from(
      new Set(
        visibleNoticesRef.current
          .map((notice) => extractFirstHttpUrl(notice.content || ""))
          .filter((url): url is string => Boolean(url))
      )
    ).slice(0, 20);
    if (urls.length === 0) return;
    let cancelled = false;
    const localCached = loadStoredLinkPreviewMap();
    if (Object.keys(localCached).length > 0) {
      setLinkPreviewByUrl((prev) => {
        const next = { ...prev };
        urls.forEach((url) => {
          const cached = localCached[url];
          if (!cached || next[url]?.resolved) return;
          linkPreviewAccessRef.current.set(url, cached.fetchedAt);
          next[url] = {
            url,
            title: cached.title,
            description: cached.description,
            image: cached.image,
            siteName: cached.siteName,
            loading: false,
            failed: false,
            resolved: true,
            error: undefined,
          };
        });
        return trimLinkPreviewState(next, linkPreviewAccessRef.current);
      });
    }
    // Batch cache-aside read: hydrate state from server cache before any edge fetch.
    const hashes = urls.map((u) => u.toLowerCase());
    void (async () => {
      try {
        const { data } = await (supabase.from("link_preview_cache" as "profiles") as unknown as {
          select: (cols: string) => { in: (col: string, vals: string[]) => Promise<{ data: Array<{ url: string; payload: { title?: string; description?: string; image?: string; siteName?: string } }> | null }> };
        }).select("url, payload").in("url_hash", hashes);
        if (cancelled) return;
        const cachedUrls = new Set<string>();
        if (data && data.length > 0) {
          setLinkPreviewByUrl((prev) => {
            const next = { ...prev };
            for (const row of data) {
              if (!row?.url || !row.payload) continue;
              if (next[row.url]?.resolved) { cachedUrls.add(row.url); continue; }
              const p = row.payload;
              const has = Boolean(p.title || p.description || p.image || p.siteName);
              if (!has) continue;
              linkPreviewAccessRef.current.set(row.url, Date.now());
              next[row.url] = {
                url: row.url,
                title: p.title || undefined,
                description: p.description || undefined,
                image: p.image || undefined,
                siteName: p.siteName || undefined,
                loading: false,
                failed: false,
                resolved: true,
                error: undefined,
              };
              persistLinkPreviewToLocalCache(row.url, next[row.url]);
              cachedUrls.add(row.url);
            }
            return trimLinkPreviewState(next, linkPreviewAccessRef.current);
          });
        }
        // Only fetch URLs missing from cache.
        const misses = urls.filter((u) => !cachedUrls.has(u));
        if (misses.length > 0) {
          misses.forEach((url) => {
            void ensureLinkPreview(url);
          });
        }
      } catch {
        // Cache lookup failure is non-fatal; fall back to direct fetch.
        urls.forEach((url) => {
          void ensureLinkPreview(url);
        });
      }
    })();
    return () => { cancelled = true; };
  }, [ensureLinkPreview, persistLinkPreviewToLocalCache, visibleNoticeIdsKey]);

  useEffect(() => {
    const draftUrl = extractFirstHttpUrl(content || "");
    if (!draftUrl) return;
    void ensureLinkPreview(draftUrl);
  }, [content, ensureLinkPreview]);

  useEffect(() => {
    if (!replyFirstUrl) return;
    void ensureLinkPreview(replyFirstUrl);
  }, [ensureLinkPreview, replyFirstUrl]);

  useEffect(() => {
    const urls = Array.from(
      new Set(
        Object.entries(commentsByThread)
          .filter(([threadId]) => expandedReplies.has(threadId))
          .flatMap(([, comments]) => comments.map((comment) => extractFirstHttpUrl(comment.content || "")))
          .filter((url): url is string => Boolean(url))
      )
    ).slice(0, 24);
    if (urls.length === 0) return;
    urls.forEach((url) => {
      void ensureLinkPreview(url);
    });
  }, [commentsByThread, ensureLinkPreview, expandedReplies]);

  useEffect(() => {
    if (!import.meta.env.DEV || !createContentFirstUrl) return;
    const preview = linkPreviewByUrl[createContentFirstUrl];
    console.debug("[link-preview] compose:state", {
      url: createContentFirstUrl,
      loading: preview?.loading ?? false,
      resolved: preview?.resolved ?? false,
      failed: preview?.failed ?? false,
      hasTitle: Boolean(preview?.title),
      hasDescription: Boolean(preview?.description),
      hasImage: Boolean(preview?.image),
      error: preview?.error || null,
    });
  }, [createContentFirstUrl, linkPreviewByUrl]);

  const triggerPullRefresh = useCallback(async () => {
    if (pullRefreshing) return;
    setPullRefreshing(true);
    try {
      await fetchNewerNotices();
    } catch {
      toast.error("Couldn't refresh");
    } finally {
      setPullRefreshing(false);
      setPullOffset(0);
      pullTriggeredRef.current = false;
      pullTouchStartYRef.current = null;
    }
  }, [fetchNewerNotices, pullRefreshing]);

  const handleTopPullStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const scroller = scrollContainerRef.current;
    if ((scroller?.scrollTop ?? 0) > 0 || pullRefreshing) {
      pullTouchStartYRef.current = null;
      pullTouchEligibleRef.current = false;
      return;
    }
    const touchY = event.touches[0]?.clientY ?? null;
    pullTouchEligibleRef.current = touchY != null;
    pullTouchStartYRef.current = pullTouchEligibleRef.current ? touchY : null;
    pullTriggeredRef.current = false;
  }, [pullRefreshing, scrollContainerRef]);

  const handleTopPullMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!pullTouchEligibleRef.current) return;
    const startY = pullTouchStartYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (startY == null || currentY == null) return;
    if ((scrollContainerRef.current?.scrollTop ?? 0) > 0) {
      pullTouchEligibleRef.current = false;
      pullTouchStartYRef.current = null;
      setPullOffset(0);
      return;
    }
    if (currentY <= startY) {
      setPullOffset(0);
      return;
    }
    const deltaY = currentY - startY;
    const eased = Math.min(deltaY * 0.55, 64);
    setPullOffset(eased);
  }, [scrollContainerRef]);

  const handleTopPullEnd = useCallback(() => {
    const shouldRefresh = pullOffset >= PULL_REFRESH_THRESHOLD && !pullRefreshing;
    if (shouldRefresh) {
      pullTriggeredRef.current = true;
      void triggerPullRefresh();
      return;
    }
    pullTouchStartYRef.current = null;
    pullTouchEligibleRef.current = false;
    pullTriggeredRef.current = false;
    setPullOffset(0);
  }, [pullOffset, pullRefreshing, triggerPullRefresh]);

  return (
    <div
      className="space-y-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+28px)]"
      onTouchStart={handleTopPullStart}
      onTouchMove={handleTopPullMove}
      onTouchEnd={handleTopPullEnd}
      onTouchCancel={handleTopPullEnd}
    >
      {/* Filters + Sorting */}
      <div className="space-y-2">
        <div
          className="flex items-center justify-center overflow-hidden transition-[height,opacity] duration-200"
          style={{ height: pullRefreshing ? 30 : pullOffset > 0 ? Math.max(16, Math.min(30, pullOffset * 0.5)) : 0, opacity: pullRefreshing || pullOffset > 0 ? 1 : 0 }}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className={cn("h-3.5 w-3.5", (pullRefreshing || pullOffset >= PULL_REFRESH_THRESHOLD) && "animate-spin")} />
            <span>{pullRefreshing ? "Refreshing..." : pullOffset >= PULL_REFRESH_THRESHOLD ? "Release to refresh" : "Pull to refresh"}</span>
          </div>
        </div>
      <div ref={filtersRowRef} className="flex flex-col gap-2 w-full max-w-full">
        {/* Row 1: Topic tabs */}
        <div className="flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setTopicFilters([])}
            className={cn(
              "pb-1.5 text-sm whitespace-nowrap shrink-0 transition-all border-b-2",
              topicFilters.length === 0
                ? "font-semibold text-foreground border-accent"
                : "font-normal text-muted-foreground border-transparent"
            )}
          >
            {t("All")}
          </button>
          {tags.map((tg) => (
            <button
              key={tg.id}
              onClick={() =>
                setTopicFilters((prev) =>
                  prev.includes(tg.id) ? prev.filter((t) => t !== tg.id) : [...prev, tg.id]
                )
              }
              className={cn(
                "pb-1.5 text-sm whitespace-nowrap shrink-0 transition-all border-b-2",
                topicFilters.includes(tg.id)
                  ? "font-semibold text-foreground border-accent"
                  : "font-normal text-muted-foreground border-transparent"
              )}
            >
              {t(tg.label)}
            </button>
          ))}
        </div>
        {/* Row 2: Search + Sort */}
        <div className="flex items-center gap-2">
          <div className="form-field-rest relative flex flex-1 min-w-0 items-center !h-11 !rounded-[22px] px-3">
            <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder=""
              className="field-input-core pl-2 text-sm"
            />
          </div>
          <div className="relative min-w-[104px] shrink-0">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "" | "Trending" | "Latest" | "Saves")}
              className="form-field-rest !h-11 !rounded-[22px] appearance-none bg-[rgba(255,255,255,0.72)] px-2.5 pr-7 text-sm"
            >
              <option value="Latest">{t("Latest")}</option>
              <option value="Trending">{t("Trending")}</option>
              <option value="Saves">{t("Saves")}</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">⌄</span>
          </div>
        </div>
      </div>
      </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleNotices.length === 0 ? (
              <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                <img
                  src={emptyChatImage}
                  alt="No posts yet"
                  className="w-full max-w-[360px] object-contain"
                />
                <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                  Looks like the floor is yours. Post something fun, real, or random - every great discussion starts with one person.
                </p>
              </div>
            ) : (
              <Virtuoso
                ref={virtuosoRef}
                customScrollParent={scrollerEl ?? undefined}
                data={visibleNotices}
                computeItemKey={(_, n) => n.id}
                increaseViewportBy={{ top: 600, bottom: 1200 }}
	                itemContent={(_, notice) => {
	                  const primaryTag = getPrimaryTag(notice);
	                  const firstUrl = extractFirstHttpUrl(notice.content || "");
	                  const preview = firstUrl ? linkPreviewByUrl[firstUrl] : null;
	                  const loadedComments = commentsByThread[notice.id];
	                  const visibleComments = (loadedComments || []).filter((comment) => !hiddenComments.has(comment.id));
	                  const visibleCommentIds = new Set(visibleComments.map((comment) => comment.id));
	                  const childCommentsByParent = new Map<string, ThreadComment[]>();
	                  const topLevelComments: ThreadComment[] = [];
	                  visibleComments.forEach((comment) => {
	                    const parentId =
	                      comment.parent_comment_id && visibleCommentIds.has(comment.parent_comment_id)
	                        ? comment.parent_comment_id
	                        : null;
	                    if (!parentId) {
	                      topLevelComments.push(comment);
	                      return;
	                    }
	                    childCommentsByParent.set(parentId, [...(childCommentsByParent.get(parentId) || []), comment]);
	                  });
	                  const flattenComments = (comments: ThreadComment[], depth = 0): Array<{ comment: ThreadComment; depth: number }> =>
	                    comments.flatMap((comment) => [
	                      { comment, depth },
	                      ...flattenComments(childCommentsByParent.get(comment.id) || [], Math.min(depth + 1, 2)),
	                    ]);
	                  const threadedComments = flattenComments(topLevelComments);
	                  const commentCountForNotice = Math.max((loadedComments || []).length, Number(notice.comment_count ?? 0));
	                  const commentsAreLoading = expandedReplies.has(notice.id) && commentsLoadingThreads.has(notice.id);
	                  const commentLoadError = commentLoadErrors[notice.id];
	                  const commentsMayBeMissing =
	                    expandedReplies.has(notice.id) &&
	                    !commentsAreLoading &&
	                    !commentLoadError &&
	                    loadedComments !== undefined &&
	                    commentCountForNotice > loadedComments.length;
	                  const activeReplyCommentIndex =
	                    replyFor === notice.id && replyTargetCommentId
	                      ? threadedComments.findIndex(({ comment }) => comment.id === replyTargetCommentId)
	                      : -1;
	                  const activeReplyDepth = activeReplyCommentIndex >= 0 ? threadedComments[activeReplyCommentIndex]?.depth ?? 0 : 0;
	                  const replyComposerIndent = replyTargetCommentId ? Math.min((activeReplyDepth + 1) * 18, 42) : 0;
	                  const replyComposerWidth = `calc(100% - ${replyComposerIndent + 4}px)`;
	                  return (
                  <div
                    key={notice.id}
                    ref={(el) => {
                      threadRefs.current[notice.id] = el;
                    }}
                    tabIndex={-1}
                    data-thread-id={notice.id}
                    className={cn(
                      "w-full max-w-full min-w-0 overflow-hidden py-4 outline-none border-b border-border/70",
                      focusedThreadId === notice.id && "bg-[#2145CF]/[0.03]"
                    )}
                  >
                    <div className="relative flex items-start gap-3">
                      <div className="absolute right-0 -top-2 z-10 flex items-center gap-1">
	                        <button
	                          type="button"
	                          onClick={() => toggleSavedNotice(notice.id)}
	                          className={cn(
	                            "h-8 w-8 rounded-full p-1.5 transition-colors flex items-center justify-center",
	                            savedNotices.has(notice.id) ? "text-brandBlue" : "text-brandText/60 hover:text-brandText"
                          )}
                          aria-label="Save post"
                        >
                          <Bookmark className={cn("h-4 w-4", savedNotices.has(notice.id) && "fill-brandBlue/20")} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedNotices((prev) => {
                              const next = new Set(prev);
                              if (next.has(notice.id)) next.delete(notice.id);
                              else next.add(notice.id);
                              return next;
                            })
                          }
                          className={cn(
                            "h-8 w-8 rounded-full p-1.5 transition-colors flex items-center justify-center",
                            pinnedNotices.has(notice.id) ? "text-brandBlue" : "text-brandText/60 hover:text-brandText"
                          )}
                          aria-label="Toggle post pin"
                        >
                          <Pin className={cn("h-4 w-4", pinnedNotices.has(notice.id) && "fill-brandBlue/20")} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          "relative w-10 h-10 rounded-full bg-transparent border-[1.5px] flex items-center justify-center overflow-hidden flex-shrink-0",
                          notice.author?.is_verified === true
                            ? "border-[rgba(33,69,207,1)]"
                            : "border-[rgba(74,73,101,0.28)]"
                        )}
	                        onClick={() => openProfile(notice.user_id, notice.author?.display_name || "User", notice.id)}
	                      >
                        <span className="absolute inset-[1px] rounded-full bg-muted/20" />
                        {notice.author?.avatar_url ? (
                          <img 
                            src={notice.author.avatar_url} 
                            alt="" 
                            width={40}
                            height={40}
                            className="relative z-[1] w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="relative z-[1] text-sm font-semibold">
                            {notice.author?.display_name?.charAt(0) || t("Unknown").charAt(0)}
                          </span>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="pr-[76px]">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            type="button"
                            className="min-w-0 underline-offset-2 hover:underline"
	                            onClick={() => openProfile(notice.user_id, notice.author?.display_name || "User", notice.id)}
	                          >
                            <AuthorHandle
                              displayName={notice.author?.display_name || t("Anonymous")}
                              socialId={notice.author?.social_id || null}
                              className="max-w-full text-sm"
                            />
                          </button>
                        </div>
                        </div>
                        <p className="text-sm font-semibold break-words">{notice.title}</p>
                        {(notice.has_alert_link || Boolean(notice.map_id)) ? (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 rounded-sm p-0 text-[13px] font-bold text-brandBlue whitespace-nowrap cursor-pointer"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const query = new URLSearchParams();
                              if (notice.map_id) query.set("alert", notice.map_id);
                              query.set("thread", notice.id);
                              navigate(`/map?${query.toString()}`);
                            }}
                          >
                            <span aria-hidden>📍</span>
                            <span className="underline underline-offset-2">{deriveDistrictLabel(notice.alert_district) || "Map"}</span>
                          </button>
                        ) : null}
                        <div
                          ref={(el) => {
                            contentRefs.current[notice.id] = el;
                          }}
                          className={cn(
                            "text-sm leading-6 text-foreground break-words whitespace-pre-wrap transition-[max-height] duration-200",
                            expandedContentIds.has(notice.id) ? "max-h-none" : "max-h-[120px] overflow-hidden"
                          )}
                        >
                          {renderTextWithMentions(
                            (() => {
                              const body = notice.content || "";
                              const u = extractFirstHttpUrl(body);
                              if (!u) return body;
                              const p = linkPreviewByUrl[u];
                              // Hide URL optimistically while loading or once resolved.
                              // Only restore the inline URL if preview definitively failed.
                              if (p?.failed) return body;
                              return body.replace(u, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
                            })(),
                            threadMentionsById[notice.id],
                            `thread-${notice.id}`,
                          )}
                        </div>
                        {expandableContentById[notice.id] ? (
                          <button
                            type="button"
	                            onClick={() =>
	                              setExpandedContentIds((prev) => {
	                                const next = new Set(prev);
	                                if (next.has(notice.id)) {
	                                  next.delete(notice.id);
	                                } else {
	                                  next.add(notice.id);
	                                  void recordSocialFeedEvent(notice.id, "expand_post");
	                                }
	                                return next;
	                              })
	                            }
                            className="mt-1 text-xs font-bold text-[rgba(74,73,101,0.72)]"
                          >
                            {expandedContentIds.has(notice.id) ? "See Less" : "Read More"}
                          </button>
                        ) : null}
                        {firstUrl ? (
                          <a
                            href={firstUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="form-field-rest mt-2 block !h-auto !p-0 overflow-hidden transition-colors hover:bg-muted/20"
                          >
                            {preview?.image ? (
                              <img
                                src={preview.image}
                                alt={preview.title || "Link preview"}
                                width={600}
                                height={314}
                                loading="lazy"
                                decoding="async"
                                className="h-44 w-full object-cover bg-muted/15"
                              />
                            ) : preview?.loading ? (
                              <div className="h-44 w-full bg-muted/20 animate-pulse" aria-hidden="true" />
                            ) : null}
                            <div className="space-y-1.5 px-3 py-2.5">
                              <p className="text-xs text-[rgba(74,73,101,0.62)]">
                                {preview?.siteName || (() => {
                                  try {
                                    return new URL(firstUrl).hostname.replace(/^www\./, "");
                                  } catch {
                                    return "External link";
                                  }
                                })()}
                              </p>
                              <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-brandText">
                                {preview?.title || formatUrlLabel(firstUrl)}
                              </p>
                              {preview?.failed ? (
                                <p className="text-xs text-[rgba(74,73,101,0.62)]">
                                  Preview unavailable{import.meta.env.DEV && preview.error ? `: ${preview.error}` : ""}
                                </p>
                              ) : null}
                            </div>
                          </a>
                        ) : null}
                        {(notice.hashtags || []).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {(notice.hashtags || []).slice(0, 3).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                          </p>
                        )}
                        {getNoticeMediaItems(notice).length > 0 && (
                          <PostMediaCarousel
                            className="mt-2"
                            isSensitive={notice.is_sensitive === true}
                            items={getNoticeMediaItems(notice)}
                          />
                        )}
                        <div className="mt-3 flex items-center">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="text-xs text-[rgba(74,73,101,0.45)]">
                              {formatTimeAgo(notice.created_at)}
                            </p>
                            {primaryTag ? (
                              <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0", getTagStyle(primaryTag, notice.id))}>
                                {t(primaryTag)}
                              </span>
                            ) : null}
                          </div>
                          <div className="ml-auto flex items-center justify-end gap-0.5 min-w-[136px]">
                            <button
                              onClick={() => handleSupport(notice.id)}
                              className={cn(
                                "relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all",
                                likedNotices.has(notice.id) ? "bg-primary/10" : "hover:bg-muted"
                              )}
                              title={t("Support")}
                            >
                              <ThumbsUp
                                className={cn(
                                  "w-4 h-4 transition-colors",
                                  likedNotices.has(notice.id) ? "text-primary fill-primary" : "text-muted-foreground"
                                )}
                              />
                              {Math.max(0, Number(notice.likes ?? 0)) > 0 ? (
                                <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">
                                  {Math.max(0, Number(notice.likes ?? 0))}
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
	                              onClick={() => openCommentsForThread(notice)}
                              className={cn(
                                "relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted",
                                expandedReplies.has(notice.id) && "bg-primary/10 text-primary"
                              )}
                              title={t("Replies")}
                              aria-label="Toggle replies"
                            >
                              <MessageCircle className="w-4 h-4" />
                              {commentCountForNotice > 0 ? (
	                                <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">
	                                  {commentCountForNotice}
	                                </span>
	                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={() => openShareSheet(notice)}
                              className="relative h-8 w-8 p-1.5 rounded-full hover:bg-muted transition-colors inline-flex items-center justify-center"
                              title={t("Share")}
                              aria-label="Share post"
                            >
                              <Send className="w-4 h-4 text-muted-foreground" />
                              {Math.max(0, Number(notice.share_count ?? 0)) > 0 ? (
                                <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">
                                  {Math.max(0, Number(notice.share_count ?? 0))}
                                </span>
                              ) : null}
                            </button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="h-8 w-8 p-1.5 rounded-full hover:bg-muted transition-colors inline-flex items-center justify-center">
                                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {notice.user_id === user?.id ? (
                                  <>
                                    <DropdownMenuItem onClick={() => handleStartEditNotice(notice)}>
                                      <Pencil className="w-4 h-4 mr-2" />
                                      {t("Edit")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => void handleDeleteNotice(notice)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      {t("Delete")}
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={() => handleReport(notice.id)}>
                                      <Flag className="w-4 h-4 mr-2" />
                                      {t("Report")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleHide(notice.id)}>
                                      <EyeOff className="w-4 h-4 mr-2" />
                                      {t("Hide")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => { setConfirmBlockId(notice.user_id); setConfirmBlockName(notice.author?.display_name ?? "this user"); }}
                                      className="text-destructive"
                                    >
                                      <Ban className="w-4 h-4 mr-2" />
                                      {t("Block User")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

	                        {expandedReplies.has(notice.id) && (
	                          <div
	                            ref={(el) => {
	                              commentPanelRefs.current[notice.id] = el;
	                            }}
	                            className="mt-4 flex flex-col gap-3"
	                          >
	                            {replyFor === notice.id && (
	                              <div
	                                ref={(el) => {
	                                  replyComposerRefs.current[notice.id] = el;
	                                }}
	                                style={
	                                  {
	                                    ...(replyTargetCommentId ? { order: 2, marginLeft: `${replyComposerIndent}px` } : {}),
	                                    width: replyComposerWidth,
	                                  }
	                                }
	                                className={cn(
	                                  "form-field-rest relative box-border h-auto min-h-[56px] max-w-full overflow-hidden rounded-[22px] bg-muted/25 px-4 py-2 shadow-none",
	                                  !replyTargetCommentId && "order-last"
	                                )}
	                              >
                                <div className="relative min-h-[24px]">
                              <div className="pointer-events-none min-h-[20px] whitespace-pre-wrap break-words text-sm leading-5">
                                    {renderComposerTextWithMentions(
                                      replyFirstUrl ? stripExternalUrlFromText(replyContent, replyFirstUrl) : replyContent,
                                      replyMentions,
                                      "Leave a comment",
                                      `reply-composer-${notice.id}`
                                    )}
                                  </div>
                                  <textarea
                                    ref={replyInputRef}
                                    value={replyContent}
                                    onChange={(e) => handleReplyInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                                    onFocus={() => setReplyComposerFocused(true)}
                                    onBlur={() => {
                                      setReplyComposerFocused(false);
                                      window.setTimeout(() => setReplyMentionQuery(null), 120);
                                    }}
                                    onInput={(event) => {
                                      if (replyMentionQuery) return;
                                      const target = event.currentTarget;
                                      target.style.height = "0px";
                                      target.style.height = `${Math.max(target.scrollHeight, 22)}px`;
                                    }}
                                    rows={1}
                                    className={cn(
                                      "field-input-core absolute inset-x-0 top-0 bottom-0 min-h-[20px] resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 text-transparent caret-[var(--text-primary)] text-sm leading-5 shadow-none outline-none",
                                      replyError && "text-destructive"
                                    )}
                                    aria-invalid={Boolean(replyError)}
                                  />
                                </div>
                                {MENTION_LIVE_SUGGESTIONS_ENABLED
                                  ? renderMentionSuggestions(
                                      replyMentionSuggestions,
                                      (suggestion) =>
                                        insertMentionIntoComposer(
                                          "reply",
                                          suggestion,
                                          replyMentionQuery,
                                          replyContent,
                                          replyMentions,
                                          replyInputRef.current
                                        ),
                                      "mt-2 max-h-52 overflow-y-auto"
                                    )
                                  : null}
                                {replyMediaFiles.length > 0 && (
                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    {replyMediaFiles.map((item, index) => (
                                      <div key={`reply-media-${index}`} className="relative">
                                        <MediaThumb
                                          src={item.previewUrl}
                                          alt={`Reply media ${index + 1}`}
                                          className={cn(
                                            "h-28 w-full aspect-video",
                                            composerUploadState.scope === "reply" && composerUploadState.status === "uploading" && "opacity-70 blur-[1.5px]"
                                          )}
                                        />
                                        {composerUploadState.scope === "reply" && composerUploadState.status === "uploading" ? (
                                          <div className="pointer-events-none absolute inset-0 z-[8] flex items-center justify-center bg-black/25 text-xs font-semibold text-white">
                                            Uploading {Math.round(composerUploadState.progress)}%
                                          </div>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() => removeReplyMediaAt(index)}
                                          className="absolute right-2 top-2 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                                          aria-label="Remove media"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {replyFirstUrl ? (
                                  <ExternalLinkPreviewCard
                                    url={replyFirstUrl}
                                    preview={replyContentPreview}
                                    className="mt-3"
                                    onRemove={() => {
                                      setReplyDismissedPreviewUrls((prev) => {
                                        const next = new Set(prev);
                                        next.add(replyFirstUrl);
                                        return next;
                                      });
                                    }}
                                  />
                                ) : null}
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <label className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40 cursor-pointer">
                                    <Image className="h-4 w-4" />
                                    <input
                                      type="file"
                                      accept="image/*,video/*"
                                      multiple
                                      className="hidden"
                                      onChange={handleReplyMediaChange}
                                    />
                                  </label>
                                  {remainingReplyWords < 0 && (
                                    <div className="ml-auto text-xs font-medium text-destructive">
                                      {remainingReplyWords}
                                    </div>
                                  )}
                                  <NeuButton
                                    size="sm"
                                    onClick={() => handleReply(notice)}
                                    disabled={(!replyContent.trim() && !replyFirstUrl) || remainingReplyWords < 0 || replySubmittingByThread.has(notice.id)}
                                    className="ml-auto h-8 w-8 min-w-0 rounded-full p-0"
                                    aria-label="Send reply"
                                  >
                                    {replySubmittingByThread.has(notice.id) ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <ArrowUp className="h-4 w-4" />
                                    )}
                                  </NeuButton>
                                </div>
                                {replyError && (
                                  <p className="mt-2 text-xs text-destructive">{replyError}</p>
                                )}
                              </div>
                            )}

	                            {commentsAreLoading && (
	                              <div className="rounded-2xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
	                                Loading comments
	                              </div>
	                            )}

	                            {!commentsAreLoading && commentLoadError && (
	                              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
	                                <span>{commentLoadError}</span>
	                                <button
	                                  type="button"
	                                  onClick={() => void loadCommentsForThread(notice.id)}
	                                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
	                                >
	                                  Try again
	                                </button>
	                              </div>
	                            )}

	                            {commentsMayBeMissing && (
	                              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
	                                <span>Some comments could not load.</span>
	                                <button
	                                  type="button"
	                                  onClick={() => void loadCommentsForThread(notice.id)}
	                                  className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
	                                >
	                                  Try again
	                                </button>
	                              </div>
	                            )}

	                            {threadedComments.map(({ comment: c, depth }, commentIndex) => {
	                              const commentIndent = Math.min(depth * 18, 42);
	                              const nextCommentDepth = threadedComments[commentIndex + 1]?.depth ?? -1;
	                              const railContinues = depth > 0 && nextCommentDepth >= depth;
	                              const commentOrder =
	                                activeReplyCommentIndex >= 0 ? (commentIndex <= activeReplyCommentIndex ? 1 : 3) : undefined;
	                              return (
	                              <div
	                                key={c.id}
	                                style={{
	                                  ...(commentOrder !== undefined ? { order: commentOrder } : {}),
	                                  ...(commentIndent > 0
	                                    ? { marginLeft: `${commentIndent}px`, width: `calc(100% - ${commentIndent}px)` }
	                                    : {}),
	                                }}
	                                className={cn(
	                                  "relative box-border max-w-full space-y-2 rounded-2xl bg-muted/25 px-3 py-3"
	                                )}
	                              >
	                                {depth > 0 ? (
	                                  <span
	                                    aria-hidden="true"
	                                    className={cn(
	                                      "pointer-events-none absolute left-0 top-[-12px] z-0 w-px bg-[rgba(74,73,101,0.24)]",
	                                      railContinues ? "bottom-[-12px]" : "bottom-0"
	                                    )}
	                                  />
	                                ) : null}
                                <div className="flex items-start gap-3">
                                  <button
                                    type="button"
                                    className="relative z-[1] h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted"
                                    onClick={() => openProfile(c.user_id, c.author?.display_name || "User")}
                                  >
                                    {c.author?.avatar_url ? (
                                      <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-brandText/70">
                                        {(c.author?.display_name || "U").charAt(0)}
                                      </span>
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <button
                                        type="button"
                                        className="min-w-0"
                                        onClick={() => openProfile(c.user_id, c.author?.display_name || "User")}
                                      >
                                        <AuthorHandle
                                          displayName={c.author?.display_name || t("Anonymous")}
                                          socialId={c.author?.social_id || null}
                                          className="max-w-full text-sm"
                                        />
                                      </button>
                                      <span className="shrink-0 text-xs text-[rgba(74,73,101,0.45)]">
                                        {formatTimeAgo(c.created_at)}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground break-words whitespace-pre-wrap">
                                      {renderTextWithMentions(
                                        (() => {
                                          const previewUrl = extractFirstHttpUrl(c.content || "");
                                          return previewUrl ? stripExternalUrlFromText(c.content, previewUrl) : c.content;
                                        })(),
                                        replyMentionsById[c.id],
                                        `reply-${c.id}`
                                      )}
                                    </div>
                                    {(() => {
                                      const previewUrl = extractFirstHttpUrl(c.content || "");
                                      const preview = previewUrl ? linkPreviewByUrl[previewUrl] || null : null;
                                      if (!previewUrl) return null;
                                      return (
                                        <ExternalLinkPreviewCard
                                          url={previewUrl}
                                          preview={preview}
                                          className="mt-3"
                                        />
                                      );
                                    })()}
                                  </div>
                                </div>
                                {c.images && c.images.length > 0 && (
                                  <PostMediaCarousel
                                    isSensitive={notice.is_sensitive === true}
                                    items={c.images.map((src, index) => ({
                                      src,
                                      alt: `${c.content.slice(0, 40) || "Reply"} ${index + 1}`,
                                    }))}
                                  />
                                )}
	                                <div className="flex items-center justify-end gap-0.5">
	                                  <button
	                                    type="button"
	                                    onClick={() => replyToComment(notice, c)}
	                                    className={cn(
	                                      "inline-flex h-8 w-8 items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted",
	                                      replyFor === notice.id && replyTargetCommentId === c.id && "bg-primary/10 text-primary"
	                                    )}
	                                    title="Reply"
	                                    aria-label="Reply to comment"
	                                  >
	                                    <MessageCircle className="h-4 w-4" />
	                                  </button>
	                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLikedComments((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(c.id)) next.delete(c.id);
                                        else next.add(c.id);
                                        return next;
                                      })
                                    }
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full p-1.5 transition-all",
                                      likedComments.has(c.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                                    )}
                                    title={t("Support")}
                                  >
                                    <ThumbsUp className={cn("h-4 w-4", likedComments.has(c.id) && "fill-primary")} />
                                  </button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {c.user_id === user?.id ? (
                                        <>
                                          <DropdownMenuItem onClick={() => void handleEditComment(notice.id, c)}>
                                            <Pencil className="w-4 h-4 mr-2" />
                                            {t("Edit")}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => void handleDeleteComment(notice.id, c)}
                                            className="text-destructive"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            {t("Delete")}
                                          </DropdownMenuItem>
                                        </>
                                      ) : (
                                        <>
                                          <DropdownMenuItem onClick={() => openReportModal(c.user_id, c.author?.display_name ?? null)}>
                                            <Flag className="w-4 h-4 mr-2" />
                                            {t("Report")}
                                          </DropdownMenuItem>
                                          {notice.user_id === user?.id && (
                                            <DropdownMenuItem onClick={() => handleHideComment(c.id)}>
                                              <EyeOff className="w-4 h-4 mr-2" />
                                              {t("Hide")}
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem
                                            onClick={() => { setConfirmBlockId(c.user_id); setConfirmBlockName(c.author?.display_name ?? "this user"); }}
                                            className="text-destructive"
                                          >
                                            <Ban className="w-4 h-4 mr-2" />
                                            {t("Block User")}
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
	                              </div>
	                              );
	                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                }}
              />
            )}

      {loadingMore ? (
        <div className="flex justify-center pt-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading more posts...</span>
          </div>
        </div>
      ) : null}

      <NoticeBoardComposerModal
        activePreviewUrl={activePreviewUrl}
        category={category}
        composerUploadState={composerUploadState}
        content={content}
        createContentPreview={createContentPreview}
        createErrors={createErrors}
        createInputRef={createInputRef}
        createIsSensitive={createIsSensitive}
        createMediaFiles={createMediaFiles}
        createMentions={createMentions}
        createSensitiveSuggested={createSensitiveSuggested}
        creating={creating}
        editingNoticeId={editingNoticeId}
        isOpen={isCreateOpen}
        mentionSuggestionsContent={
          MENTION_LIVE_SUGGESTIONS_ENABLED
            ? renderMentionSuggestions(
                createMentionSuggestions,
                (suggestion) =>
                  insertMentionIntoComposer(
                    "create",
                    suggestion,
                    createMentionQuery,
                    content,
                    createMentions,
                    createInputRef.current,
                  ),
                "mt-2 max-h-52 overflow-y-auto",
              )
            : null
        }
        onCategoryChange={setCategory}
        onClose={closeCreateComposer}
        onContentBlur={() => {
          setCreateComposerFocused(false);
          window.setTimeout(() => setCreateMentionQuery(null), 120);
        }}
        onContentChange={handleCreateInputChange}
        onContentFocus={() => setCreateComposerFocused(true)}
        onDismissPreview={dismissCreatePreview}
        onMediaChange={handleCreateMediaChange}
        onRemoveMedia={removeCreateMediaAt}
        onSensitiveChange={(checked) => {
          setCreateIsSensitive(checked);
          if (!checked) setCreateSensitiveSuggested(false);
        }}
        onSubmit={handleCreateNotice}
        onTitleChange={setTitle}
        onVideoTrimStartChange={updateCreateVideoTrimStart}
        previewUrlLabel={formatUrlLabel}
        remainingCreateWords={remainingCreateWords}
        renderComposerTextWithMentions={renderComposerTextWithMentions}
        tags={tags}
        title={title}
        translate={t}
      />

      <NoticeBoardOverlays
        confirmBlockId={confirmBlockId}
        confirmBlockName={confirmBlockName}
        onBlockConfirm={() => {
          if (confirmBlockId) void handleBlockUser(confirmBlockId);
          setConfirmBlockId(null);
        }}
        onBlockDialogChange={(open) => {
          if (!open) setConfirmBlockId(null);
        }}
        onProfileClose={() => setProfileOpen(false)}
        onReportClose={() => {
          setReportOpen(false);
          setReportTargetUserId(null);
          setReportTargetName("");
        }}
        onRestrictionClose={() => setSocialRestrictionModalOpen(false)}
        onShareAction={() => {
          if (sharePayload) {
            void recordShareClick(sharePayload.contentId);
          }
        }}
        onShareClose={() => setShareOpen(false)}
        profileFallbackName={profileFallbackName}
        profileOpen={profileOpen}
        profileUserId={profileUserId}
        reportOpen={reportOpen}
        reportTargetName={reportTargetName}
        reportTargetUserId={reportTargetUserId}
        shareOpen={shareOpen}
        sharePayload={sharePayload}
        socialRestrictionModalOpen={socialRestrictionModalOpen}
      />

    </div>
  );
};
