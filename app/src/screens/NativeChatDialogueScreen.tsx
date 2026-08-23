import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { launchNativeImageLibraryAsync } from "../lib/nativeMediaPermissions";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { BlurView as RNBlurView } from "@react-native-community/blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTimeZones } from "@vvo/tzdb";
import teamHuddleLogo from "../../assets/huddle-logo-transparent.png";
import profilePlaceholder from "../../assets/ProfilePlaceholder.png";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeToast, NATIVE_TOAST_DURATION_MS } from "../components/NativeToast";
import { NativeSocialExternalLinkPreview, NativeSocialMediaCarousel, type NativeSocialCarouselItem } from "../components/social/NativeSocialFeedPrimitives";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { NativeGlassCircle } from "../components/NativeGlassCircle";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { readCachedNativeViewerScope } from "../lib/nativeViewerScope";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppConfirmModal, AppDestructiveSlideConfirm, AppKeyboardAvoidingView as KeyboardAvoidingView, AppModalCloseButton, AppModalError, AppModalField, AppModalIconButton, AppModalSelectField, SlideToConfirm } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import {
  createNativeChatAttachmentSignedUrls,
  createNativeGroupChatEvent,
  createNativeRecurringGroupChatEvent,
  clearCachedNativeChatMessages,
  cancelNativeGroupEventOccurrence,
  cancelNativeGroupEventSeries,
  cancelNativeGroupInvite,
  deleteOwnNativeChatAttachment,
  ensureNativeDirectChatRoom,
  extractNativeAvatarStorageObjectPath,
  fetchNativeChatDialogueSnapshot,
  fetchNativeGroupChatEvents,
  fetchNativeGroupManagementSnapshot,
  invalidateNativeChatReadCaches,
  invalidateNativeDiscoveryRelationshipCache,
  invalidateNativeMatchedRailSummary,
  inviteNativeGroupMembers,
  isNativeChatSystemBannerContent,
  isNativeTeamHuddleIdentity,
  markNativeChatRoomSeen,
  markNativeChatRoomRead,
  markNativeChatMessagesRead,
  NATIVE_CHAT_ATTACHMENTS_BUCKET,
  patchCachedNativeChatInboxGroupRows,
  parseNativeChatRouteParams,
  publishNativeChatUnmatchCommitted,
  readCachedNativeChatMessages,
  removeNativeGroupChat,
  removeNativeGroupChatEvent,
  removeNativeGroupMember,
  sendNativeChatMessage,
  setNativeGroupMuteState,
  TEAM_HUDDLE_AVAILABILITY,
  TEAM_HUDDLE_DISPLAY_NAME,
  TEAM_HUDDLE_USER_ID,
  toggleNativeGroupChatEventRsvp,
  updateNativeGroupChatEvent,
  updateNativeGroupEventSeries,
  updateNativeGroupJoinRequest,
  updateNativeGroupChatMetadata,
  uploadNativeChatAttachment,
  uploadNativeChatStorageObject,
  writeCachedNativeChatMessages,
  type NativeChatAttachment,
  type NativeChatInboxRow,
  type NativeChatMessage,
  type NativeChatRoom,
  type NativeExploreGroup,
  type NativeGroupManagementSnapshot,
  type NativeGroupChatEvent,
  type NativeGroupEventRecurrenceRule,
} from "../lib/nativeChat";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { GroupDetailsModal } from "./NativeChatsScreen";
import { NativeMediaImageCropper } from "../components/profile/NativeProfilePhotoCropper";
import { pickNativeProfilePhoto } from "../components/profile/NativeProfilePhotoPicker";
import type { NativeProfileUploadAsset } from "../lib/nativeProfilePhotos";
import { haptic } from "../lib/nativeHaptics";
import { recordAppReviewInteraction, requestAppReview } from "../lib/nativeAppReview";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import {
  extractCompletedNativeSocialPreviewUrl,
  extractNativeSocialFirstHttpUrl,
  fetchNativeSocialLinkPreviews,
  stripNativeSocialExternalUrlFromText,
  type NativeSocialLinkPreview,
} from "../lib/nativeSocial";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { shouldHydrateCachedMessagesBeforeMembership } from "../lib/nativeChatMirror";
import { readNativeChatSelectedRowHandoff } from "../lib/nativeChatHandoff";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import {
  beginNativeChatOutboxRetry,
  createNativeChatClientMessageId,
  dismissNativeChatOutboxMessage,
  failNativeChatOutboxMessage,
  isPendingNativeChatMessage,
  reconcileNativeChatOutboxMessage,
  reconcileNativeChatRealtimeMessage,
} from "../lib/nativeChatOutbox";
import { readNativeLocalMediaFile } from "../lib/nativeLocalMediaUpload";
import { NATIVE_CHAT_MEDIA_MAX_BYTES } from "../lib/nativeMediaPolicy";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { resolveNativeProfilePhotoDisplayUrl } from "../lib/nativeProfilePhotos";
import { subscribeNativeProfileSummary } from "../lib/nativeProfileSummary";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { nativePathForHuddleWebPath, nativePathForSharedContent, navigateNativeHuddleLink } from "../lib/nativeInternalLinks";
import { useNativeModalTransition } from "../lib/nativeModalTransition";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import {
  averageNativeUploadProgress,
  NATIVE_UPLOAD_PROGRESS_READ_READY,
  NATIVE_UPLOAD_PROGRESS_START,
  NATIVE_UPLOAD_PROGRESS_UPLOAD_READY,
  nextNativeUploadProgress,
} from "../lib/nativeUploadProgress";
import { huddleButtons, huddleColors, huddleFormControls, huddleGlassControls, huddleLayout, huddleRadii, huddleShadows, huddleSocial, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

type BlockState = "none" | "blocked_by_them" | "blocked_by_me";
type UnmatchState = "none" | "unmatched_by_them" | "unmatched_by_me";

type ProfileSummary = {
  id: string;
  displayName: string;
  socialId: string | null;
  avatarUrl: string | null;
  availability: string | null;
  isVerified: boolean;
  hasCar: boolean;
  isTeamHuddle?: boolean;
};

type ParsedMessage = {
  text: string;
  attachments: Array<{ bucket: string | null; name: string; mime: string; url: string | null; path: string | null }>;
  kind: string | null;
  deletedAt: string | null;
  linkPreviewUrl: string | null;
  senderId: string | null;
  recipientId: string | null;
  share: { contentId?: string; contentType?: "alert" | "thread"; title?: string; description?: string; imageUrl?: string; appUrl?: string; canonicalUrl?: string; chatHeadline?: string; surface?: string } | null;
};

type PendingMedia = {
  height: number | null;
  uri: string;
  name: string;
  mime: string;
  size: number | null;
  status: "queued" | "uploading" | "uploaded" | "error";
  progress: number;
  attachment?: NativeChatAttachment | null;
  width: number | null;
};

type GroupManageMember = { id: string; name: string; avatarUrl: string | null; socialId: string | null; isVerified: boolean };

const INITIAL_MESSAGE_LOAD_SIZE = 10;
const OLDER_MESSAGE_PAGE_SIZE = 20;
const MESSAGE_READ_BUFFER_MS = 100;
const ROOM_READ_FAILURE_COOLDOWN_MS = 15000;
const DELETED_MESSAGE_VISIBLE_MS = 2 * 60 * 60 * 1000;

const MEMBERSHIP_REALTIME_COOLDOWN_MS = 1000;
const MESSAGE_MUTATION_REFRESH_DEBOUNCE_MS = 350;
const GROUP_DESCRIPTION_WORD_LIMIT = 100;
const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const pad2 = (value: number) => String(value).padStart(2, "0");

const localDateInputValue = (value: Date) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const localTimeInputValue = (value: Date) => `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

const normalizeEventHHMM = (value: string) => {
  const cleaned = value.trim().replace(/[.]/g, ":");
  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return cleaned;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2] ?? "0")));
  return `${pad2(hours)}:${pad2(minutes)}`;
};

const isEventHHMM = (value: string) => /^\d{2}:\d{2}$/.test(value.trim());

const isEventIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && Number.isFinite(new Date(`${value.trim()}T00:00:00`).getTime());

const eventDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const eventDatePartsFromIso = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  if (!match) return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const safeMonth = Math.min(12, Math.max(1, month));
  return { year, month: safeMonth, day: Math.min(eventDaysInMonth(year, safeMonth), Math.max(1, day)) };
};

const eventIsoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(eventDaysInMonth(year, month), Math.max(1, day)))}`;

const parseLocalEventDateTime = (dateValue: string, timeValue: string) => {
  const match = `${dateValue}T${timeValue}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0);
  return Number.isFinite(next.getTime()) ? next : null;
};

const GROUP_EVENT_RECURRENCE_OPTIONS: Array<{ label: string; value: NativeGroupEventRecurrenceRule }> = [
  { label: "Every week", value: "weekly" },
  { label: "Every 2 weeks", value: "biweekly" },
  { label: "Every month", value: "monthly" },
];

const GROUP_EVENT_SINGLE_ZONE_COUNTRIES: Record<string, string> = {
  hk: "Asia/Hong_Kong",
  hkg: "Asia/Hong_Kong",
  "hong kong": "Asia/Hong_Kong",
  sg: "Asia/Singapore",
  sgp: "Asia/Singapore",
  singapore: "Asia/Singapore",
  jp: "Asia/Tokyo",
  jpn: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  kr: "Asia/Seoul",
  kor: "Asia/Seoul",
  "south korea": "Asia/Seoul",
  tw: "Asia/Taipei",
  twn: "Asia/Taipei",
  taiwan: "Asia/Taipei",
  cn: "Asia/Shanghai",
  chn: "Asia/Shanghai",
  china: "Asia/Shanghai",
  gb: "Europe/London",
  gbr: "Europe/London",
  "united kingdom": "Europe/London",
  ie: "Europe/Dublin",
  irl: "Europe/Dublin",
  ireland: "Europe/Dublin",
  ae: "Asia/Dubai",
  are: "Asia/Dubai",
  "united arab emirates": "Asia/Dubai",
};

const GROUP_EVENT_ALLOWED_TIME_ZONE_COUNTRY_CODES = new Set([
  "AD", "AE", "AR", "AT", "AU", "BB", "BE", "BG", "BH", "BR", "CA", "CH", "CL", "CN", "CO", "CR", "CY", "CZ", "DE", "DK", "DO", "EC", "EE", "EG", "ES", "FI", "FR", "GB", "GE", "GH", "GR", "GT", "HK", "HR", "HU", "ID", "IE", "IL", "IN", "IS", "IT", "JO", "JP", "KE", "KH", "KR", "KW", "KZ", "LB", "LI", "LT", "LU", "LV", "MA", "MC", "ME", "MO", "MT", "MU", "MV", "MX", "MY", "NL", "NO", "NZ", "PA", "PE", "PH", "PL", "PT", "QA", "RO", "RS", "SA", "SE", "SG", "SI", "SK", "TH", "TR", "TW", "US", "UY", "VA", "VN", "ZA",
]);

const groupEventOffsetLabel = (minutes: number) => {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `UTC${sign}${hours}${remainder ? `:${pad2(remainder)}` : ""}`;
};

const GROUP_EVENT_TIME_ZONE_DATA = (() => {
  const groups = new Map<string, { countries: Set<string>; name: string; offset: number }>();
  const zoneKeys = new Map<string, string>();
  getTimeZones({ includeUtc: false })
    .filter((zone) => GROUP_EVENT_ALLOWED_TIME_ZONE_COUNTRY_CODES.has(zone.countryCode))
    .forEach((zone) => {
      const key = `${zone.rawOffsetInMinutes}:${zone.currentTimeOffsetInMinutes}`;
      zoneKeys.set(zone.name, key);
      const current = groups.get(key);
      if (current) {
        current.countries.add(zone.countryCode);
        return;
      }
      groups.set(key, { countries: new Set([zone.countryCode]), name: zone.name, offset: zone.currentTimeOffsetInMinutes });
    });
  const ordered = Array.from(groups.entries()).sort(([, left], [, right]) => left.offset - right.offset);
  const canonicalByZone = new Map(Array.from(zoneKeys, ([zone, key]) => [zone, groups.get(key)!.name]));
  return { canonicalByZone, groups: ordered.map(([, group]) => group) };
})();

const GROUP_EVENT_TIME_ZONE_LABELS = new Map(GROUP_EVENT_TIME_ZONE_DATA.groups.map((group) => [
  group.name,
  groupEventOffsetLabel(group.offset),
]));

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const canonicalGroupEventTimeZone = (value: string) => GROUP_EVENT_TIME_ZONE_DATA.canonicalByZone.get(value) || GROUP_EVENT_TIME_ZONE_DATA.groups.find((group) => group.name === value)?.name || "Asia/Hong_Kong";

const inferGroupEventTimeZone = (room: NativeChatRoom | null, userLocationTimeZone?: string | null) => {
  const persisted = String(room?.timeZone || "").trim();
  if (persisted) return canonicalGroupEventTimeZone(persisted);
  const country = String(room?.locationCountry || "").trim().toLowerCase();
  return canonicalGroupEventTimeZone(GROUP_EVENT_SINGLE_ZONE_COUNTRIES[country] || userLocationTimeZone || deviceTimeZone());
};

const supportedGroupEventTimeZones = (priorityZones: Array<string | null | undefined>) => {
  const priorityGroups = priorityZones.flatMap((zone) => {
    const canonical = zone ? (GROUP_EVENT_TIME_ZONE_DATA.canonicalByZone.get(zone) || zone) : null;
    const group = GROUP_EVENT_TIME_ZONE_DATA.groups.find((candidate) => candidate.name === canonical);
    return group ? [group] : [];
  });
  const priorityNames = new Set(priorityGroups.map((group) => group.name));
  const ordered = [...priorityGroups, ...GROUP_EVENT_TIME_ZONE_DATA.groups.filter((group) => !priorityNames.has(group.name))];
  const seenOffsets = new Set<number>();
  return ordered.flatMap((group) => {
    if (seenOffsets.has(group.offset)) return [];
    seenOffsets.add(group.offset);
    return [group.name];
  });
};

const groupEventTimeZoneLabel = (value: string, now = new Date()) => {
  const grouped = GROUP_EVENT_TIME_ZONE_LABELS.get(value);
  const currentTime = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: value, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    } catch {
      return "--:--";
    }
  })();
  if (grouped) return `${grouped} (${currentTime})`;
  try {
    const offset = new Intl.DateTimeFormat(undefined, {
      timeZone: value,
      timeZoneName: "longOffset",
    }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
    return `${offset ? offset.replace("GMT", "UTC") : "UTC+00:00"} (${currentTime})`;
  } catch {
    return `UTC+00:00 (${currentTime})`;
  }
};

const eventInputsInTimeZone = (iso: string, timeZone: string, fallback: Date) => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return { date: localDateInputValue(fallback), time: localTimeInputValue(fallback) };
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const hour = part("hour");
    const minute = part("minute");
    if (year && month && day && hour && minute) return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    // Invalid or unavailable time zones fall back to the device-local value.
  }
  return { date: localDateInputValue(date), time: localTimeInputValue(date) };
};

const formatEventCardDateTime = (startsAt: string, endsAt: string) => {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
  const date = start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${startTime} – ${endTime}`;
};

const formatEventCardDateTimeWithIcon = (startsAt: string, endsAt: string) => {
  const formatted = formatEventCardDateTime(startsAt, endsAt);
  return formatted ? `🗓️ ${formatted}` : "";
};

const nativeChatDialogueSessionKey = (userId: string | null, sessionKey?: string | null) =>
  String(sessionKey || (userId ? `${userId}:0` : "anon:0"));

const clean = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const extractFirstHttpUrl = extractNativeSocialFirstHttpUrl;
const stripUrl = stripNativeSocialExternalUrlFromText;
const extractCompletedPreviewUrl = (value: string) => {
  return extractCompletedNativeSocialPreviewUrl(value);
};

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";

const chatPersonAvailabilityLabel = (source: Record<string, unknown>) => {
  const normalizeAvailability = (entry: unknown) => {
    const role = String(entry || "").trim();
    return /^animal friend\s*\(no pet\)$/i.test(role) ? "Animal Friend" : role;
  };
  const availability = Array.isArray(source.availability_status)
    ? source.availability_status.map(normalizeAvailability).filter(Boolean).join(" • ")
    : null;
  if (availability) return availability;
  return source.owns_pets === true || source.has_active_pet === true ? "Pet Parent" : "Animal Friend";
};

function mapGroupManageMember(row: unknown): GroupManageMember | null {
  const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const id = String(source.id || "");
  if (!id) return null;
  return {
    id,
    name: clean(source.display_name) || "User",
    avatarUrl: clean(source.avatar_url),
    socialId: clean(source.social_id),
    isVerified: source.is_verified === true,
  };
}

const profileSummaryToProfileFallback = (profile: ProfileSummary | null | undefined) => profile?.id ? {
  id: profile.id,
  display_name: profile.displayName,
  social_id: profile.socialId,
  avatar_url: profile.avatarUrl,
  is_verified: profile.isVerified,
  location_name: null,
} : null;

const groupMemberToProfileFallback = (member: GroupManageMember | null | undefined) => member?.id ? {
  id: member.id,
  display_name: member.name,
  social_id: member.socialId,
  avatar_url: member.avatarUrl,
  is_verified: member.isVerified,
  location_name: null,
} : null;

function ResilientAvatarImage({
  fallback,
  resizeMode = "cover",
  style,
  uri,
  version,
}: {
  fallback: ReactNode;
  resizeMode?: "cover" | "contain";
  style: StyleProp<ImageStyle>;
  uri: string | null | undefined;
  version?: string | null;
}) {
  const resolved = useMemo(() => resolveNativeAvatarUrl(uri), [uri]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);
  if (!resolved || failed) return <>{fallback}</>;
  const imageVersion = version || resolved;
  return <Image key={nativeFreshImageKey(resolved, imageVersion)} onError={() => setFailed(true)} resizeMode={resizeMode} source={{ uri: nativeFreshImageUri(resolved, imageVersion) }} style={style} />;
}

const formatMessageTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(dt);
};

const formatDividerLabel = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMessage = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const days = Math.floor((startNow.getTime() - startMessage.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

const isStarIntroKind = (kind: string | null | undefined) => String(kind || "").trim() === "star_intro";

const parseStarChatContent = (rawContent: string | null | undefined) => {
  const fallback = {
    text: String(rawContent || "").trim(),
    kind: null as string | null,
    senderId: null as string | null,
    recipientId: null as string | null,
  };
  if (!fallback.text) return fallback;
  try {
    const parsed = JSON.parse(fallback.text) as Record<string, unknown>;
    return {
      text: typeof parsed.text === "string" && parsed.text ? parsed.text : fallback.text,
      kind: typeof parsed.kind === "string" ? parsed.kind : null,
      senderId: typeof parsed.sender_id === "string" ? parsed.sender_id : null,
      recipientId: typeof parsed.recipient_id === "string" ? parsed.recipient_id : null,
    };
  } catch {
    return fallback;
  }
};

const buildShareHeadline = (share: ParsedMessage["share"]) => {
  const surface = String((share as { surface?: unknown } | null)?.surface || "Social");
  const raw = String((share as { chatHeadline?: unknown } | null)?.chatHeadline || "").trim();
  if (raw && /on huddle's (Social|Map)$/i.test(raw)) return raw;
  const title = String(share?.title || "").trim();
  const withSocial = title.match(/^(.+?)\s+\(@([^)]+)\)\s+on\s+huddle$/i);
  if (withSocial) return `${withSocial[1]} (@${withSocial[2]}) on huddle's ${surface}`;
  const socialOnly = title.match(/^@(.+?)\s+on\s+huddle$/i);
  if (socialOnly) return `@${socialOnly[1]} on huddle's ${surface}`;
  const nameOnly = title.match(/^(.+?)\s+on\s+huddle$/i);
  if (nameOnly) return `${nameOnly[1]} on huddle's ${surface}`;
  return `${surface === "Map" ? "Alert" : "Post"} on huddle's ${surface}`;
};

const getShareTargetUrl = (share: ParsedMessage["share"]) => String(share?.appUrl || share?.canonicalUrl || "").trim();

const normalizeMembershipHintText = (text: string) => {
  const normalized = text.trim();
  const joined = normalized.match(/^(.+?)\s+has joined the group!$/i);
  if (joined) return `${joined[1]} just joined the chat.`;
  return normalized;
};

const messageTimeValue = (message: NativeChatMessage) => {
  const value = new Date(message.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
};

const mergeNativeChatMessages = (base: NativeChatMessage[], incoming: NativeChatMessage[]) => {
  const byId = new Map<string, NativeChatMessage>();
  [...base, ...incoming].forEach((message) => {
    if (message.id) byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort((left, right) => messageTimeValue(left) - messageTimeValue(right));
};

const replacePendingNativeChatMessage = (
  current: NativeChatMessage[],
  pendingId: string,
  confirmed: NativeChatMessage,
) => reconcileNativeChatOutboxMessage(current, pendingId, confirmed).messages;

const parseMessageContent = (content: string): ParsedMessage => {
  const star = parseStarChatContent(content);
  if (isStarIntroKind(star.kind)) {
    return {
      text: star.text || "Star connection started.",
      attachments: [],
      kind: star.kind,
      deletedAt: null,
      linkPreviewUrl: null,
      senderId: star.senderId,
      recipientId: star.recipientId,
      share: null,
    };
  }
  try {
    const envelope = JSON.parse(content) as Record<string, unknown>;
    const share = envelope?.kind === "huddle_share" && envelope.share && typeof envelope.share === "object"
      ? envelope.share as ParsedMessage["share"]
      : null;
    if (share) return { text: "", attachments: [], kind: "huddle_share", deletedAt: null, linkPreviewUrl: null, senderId: null, recipientId: null, share };
    const rawAttachments = Array.isArray(envelope.attachments) ? envelope.attachments : [];
    return {
      text: String(envelope.text || ""),
      kind: clean(envelope.kind),
      deletedAt: clean(envelope.deletedAt) || clean(envelope.deleted_at),
      linkPreviewUrl: clean(envelope.linkPreviewUrl),
      senderId: clean(envelope.sender_id),
      recipientId: clean(envelope.recipient_id),
      share: null,
      attachments: rawAttachments.map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          bucket: clean(row.bucket),
          name: clean(row.name) || "media",
          mime: clean(row.mime) || "",
          path: clean(row.path),
          url: clean(row.url),
        };
      }).filter((item) => item.path || item.url),
    };
  } catch {
    return { text: content, attachments: [], kind: null, deletedAt: null, linkPreviewUrl: null, senderId: null, recipientId: null, share: null };
  }
};

const messageDeletedAtValue = (message: NativeChatMessage, parsed: ParsedMessage) => {
  const value = new Date(parsed.deletedAt || message.updatedAt || message.createdAt).getTime();
  return Number.isFinite(value) ? value : messageTimeValue(message);
};

const shouldDisplayChatMessage = (message: NativeChatMessage, viewerId: string | null, now = Date.now()) => {
  const parsed = parseMessageContent(message.content);
  if (parsed.kind !== "deleted") return true;
  if (message.senderId === viewerId) return false;
  return now - messageDeletedAtValue(message, parsed) < DELETED_MESSAGE_VISIBLE_MS;
};

async function resolveAttachmentUrls(messages: NativeChatMessage[], accessToken?: string | null, existing: Record<string, string | null> = {}) {
  const paths = new Set<string>();
  messages.forEach((message) => {
    parseMessageContent(message.content).attachments.forEach((attachment) => {
      if (attachment.path && existing[attachment.path] === undefined && (!attachment.bucket || attachment.bucket === NATIVE_CHAT_ATTACHMENTS_BUCKET)) {
        paths.add(attachment.path);
      }
    });
  });
  const resolved: Record<string, string | null> = { ...existing };
  const uniquePaths = Array.from(paths);
  if (uniquePaths.length === 0) return resolved;
  try {
    const signedByPath = await createNativeChatAttachmentSignedUrls(uniquePaths, accessToken);
    uniquePaths.forEach((path) => {
      resolved[path] = signedByPath[path] || null;
    });
  } catch {
    uniquePaths.forEach((path) => {
      resolved[path] = null;
    });
    return resolved;
  }
  return resolved;
}

async function fetchProfiles(ids: string[], accessToken?: string | null) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await nativeExactTokenRpc("get_native_chat_profile_summaries", {
    p_user_ids: unique,
  }, accessToken);
  if (error) throw error;
  const profiles = await Promise.all((Array.isArray(data) ? data : []).map(async (row) => {
    const source = row as Record<string, unknown>;
    const socialRole = chatPersonAvailabilityLabel(source);
    const id = String(source.id || "");
    if (!id) return null;
    const rawDisplayName = clean(source.display_name) || "huddle member";
    const rawSocialId = clean(source.social_id);
    const isTeamHuddle = id === TEAM_HUDDLE_USER_ID || isNativeTeamHuddleIdentity(rawDisplayName, rawSocialId);
    return {
      id,
      displayName: isTeamHuddle ? TEAM_HUDDLE_DISPLAY_NAME : rawDisplayName,
      socialId: isTeamHuddle ? "teamhuddle" : rawSocialId,
      avatarUrl: isTeamHuddle ? null : (await resolveNativeProfilePhotoDisplayUrl(typeof source.avatar_url === "string" ? source.avatar_url : null)) ?? resolveNativeAvatarUrl(source.avatar_url),
      availability: isTeamHuddle ? TEAM_HUDDLE_AVAILABILITY : socialRole,
      isVerified: isTeamHuddle ? true : isNativeVerifiedProfile(source),
      hasCar: source.has_car === true,
      isTeamHuddle,
    };
  }));
  return profiles.reduce<Record<string, ProfileSummary>>((map, profile) => {
    if (profile) map[profile.id] = profile;
    return map;
  }, {});
}

export function NativeChatDialogueScreen({
  accessToken,
  onGoBack,
  onNavigate,
  onRoomRead,
  search,
  sessionKey,
  userId,
}: {
  accessToken?: string | null;
  onGoBack: () => void;
  onNavigate: (path: string) => void;
  onRoomRead?: (roomId: string, unreadHint?: number) => void;
  search?: string;
  sessionKey?: string | null;
  userId: string | null;
}) {
  const insets = useSafeAreaInsets();
  const params = useMemo(() => parseNativeChatRouteParams(search || ""), [search]);
  const selectedHandoffRow = useMemo(() => readNativeChatSelectedRowHandoff({ roomId: params.room, sessionKey, userId }), [params.room, sessionKey, userId]);
  const targetMessageId = params.targetMessageId;
  const currentDialogueSessionKey = useMemo(() => nativeChatDialogueSessionKey(userId, sessionKey), [sessionKey, userId]);
  const routeMode = params.room ? "room" : params.withUserId ? "direct" : "missing";
  const routeChatKey = params.room || params.withUserId || "missing";
  const roomKey = useMemo(
    () => `${userId || "anon"}:${currentDialogueSessionKey}:${routeMode}:${routeChatKey}`,
    [currentDialogueSessionKey, routeChatKey, routeMode, userId],
  );
  const routeAvatarHint = useMemo(() => {
    const query = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return query.get("avatar") || null;
  }, [search]);
  const [roomId, setRoomId] = useState<string | null>(params.room);
  const [loadedRoomId, setLoadedRoomId] = useState<string | null>(selectedHandoffRow?.chatId || null);
  const [room, setRoom] = useState<NativeChatRoom | null>(() => selectedHandoffRow ? {
    id: selectedHandoffRow.chatId,
    type: selectedHandoffRow.roomType === "group" ? "group" : selectedHandoffRow.roomType === "service" ? "service" : "direct",
    name: selectedHandoffRow.chatName || selectedHandoffRow.peerName || params.name || null,
    avatarUrl: selectedHandoffRow.avatarUrl || selectedHandoffRow.peerAvatarUrl || null,
    createdBy: selectedHandoffRow.createdBy,
    createdAt: selectedHandoffRow.createdAt,
    updatedAt: null,
    lastMessageAt: selectedHandoffRow.lastMessageAt,
    visibility: selectedHandoffRow.visibility,
    joinMethod: selectedHandoffRow.joinMethod,
    roomCode: selectedHandoffRow.roomCode,
    locationLabel: selectedHandoffRow.locationLabel,
    locationCountry: selectedHandoffRow.locationCountry,
    petFocus: selectedHandoffRow.petFocus || [],
    description: selectedHandoffRow.description,
    timeZone: null,
  } : params.joined && params.room ? {
    id: params.room,
    type: "group",
    name: params.name || "Group",
    avatarUrl: routeAvatarHint,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    lastMessageAt: null,
    visibility: null,
    joinMethod: null,
    roomCode: null,
    locationLabel: null,
    locationCountry: null,
    petFocus: [],
    description: null,
    timeZone: null,
  } : null);
  const [messages, setMessages] = useState<NativeChatMessage[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [counterpart, setCounterpart] = useState<ProfileSummary | null>(() => selectedHandoffRow?.peerUserId || params.withUserId || params.name ? {
    id: selectedHandoffRow?.peerUserId || params.withUserId || "",
    displayName: selectedHandoffRow?.peerName || params.name || "Conversation",
    socialId: selectedHandoffRow?.peerSocialId || null,
    avatarUrl: selectedHandoffRow?.peerAvatarUrl || routeAvatarHint,
    availability: selectedHandoffRow?.peerAvailabilityLabel || "Animal Friend",
    isVerified: selectedHandoffRow?.peerIsVerified === true,
    hasCar: selectedHandoffRow?.peerHasCar === true,
    isTeamHuddle: isNativeTeamHuddleIdentity(selectedHandoffRow?.peerName || params.name || "", selectedHandoffRow?.peerSocialId || ""),
  } : null);
  const [groupOwner, setGroupOwner] = useState<ProfileSummary | null>(null);
  const [memberCount, setMemberCount] = useState(selectedHandoffRow?.memberCount || 0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupMuted, setGroupMuted] = useState(false);
  const [blockState, setBlockState] = useState<BlockState>("none");
  const [unmatchState, setUnmatchState] = useState<UnmatchState>("none");
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string | null>>({});
  const [failedAttachmentKeys, setFailedAttachmentKeys] = useState<Set<string>>(new Set());
  const [linkPreviews, setLinkPreviews] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [input, setInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);
  const [uploads, setUploads] = useState<PendingMedia[]>([]);
  const [loading, setLoading] = useState(!selectedHandoffRow && !params.name);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupInfoCountdownNow, setGroupInfoCountdownNow] = useState(() => Date.now());
  const [groupDetailsErrors, setGroupDetailsErrors] = useState<{ cover?: boolean; description?: boolean; location?: boolean; name?: boolean }>({});
  const [groupLocationDraft, setGroupLocationDraft] = useState("");
  const [groupPetFocusDraft, setGroupPetFocusDraft] = useState<string[]>([]);
  const [groupManagement, setGroupManagement] = useState<NativeGroupManagementSnapshot | null>(null);
  const [groupManagementLoading, setGroupManagementLoading] = useState(false);
  const [groupManagementError, setGroupManagementError] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [groupManageLoading, setGroupManageLoading] = useState(false);
  const [groupManageMembers, setGroupManageMembers] = useState<GroupManageMember[]>([]);
  const [groupManageFriends, setGroupManageFriends] = useState<GroupManageMember[]>([]);
  const [groupManageSearch, setGroupManageSearch] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupNameEditing, setGroupNameEditing] = useState(false);
  const [groupNameSaving, setGroupNameSaving] = useState(false);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupDescriptionSaving, setGroupDescriptionSaving] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [confirmRemoveGroupOpen, setConfirmRemoveGroupOpen] = useState(false);
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [, setChatHeaderHeight] = useState(56);
  const [confirmUnmatchOpen, setConfirmUnmatchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [profileSheetFallbackData, setProfileSheetFallbackData] = useState<Record<string, unknown> | null>(null);
  const [chatDisabledBySafety, setChatDisabledBySafety] = useState(false);
  const [chatSafetyResolved, setChatSafetyResolved] = useState(false);
  const [currentUserTier, setCurrentUserTier] = useState("free");
  const [currentUserVerified, setCurrentUserVerified] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [groupAvatarBusy, setGroupAvatarBusy] = useState<"upload" | "remove" | null>(null);
  const [groupCoverCropAsset, setGroupCoverCropAsset] = useState<(NativeProfileUploadAsset & { width?: number | null; height?: number | null }) | null>(null);

  // The notice bar is transient — auto-dismiss so confirmations/errors fade like a
  // notification instead of staying pinned under the header.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NATIVE_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!groupInfoOpen) return undefined;
    setGroupInfoCountdownNow(Date.now());
    const timer = setInterval(() => setGroupInfoCountdownNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [groupInfoOpen]);
  const [groupVerifyGateOpen, setGroupVerifyGateOpen] = useState(false);
  const [groupManageReturnToInfo, setGroupManageReturnToInfo] = useState(false);
  const [groupDescriptionEditing, setGroupDescriptionEditing] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [groupMemberReportTarget, setGroupMemberReportTarget] = useState<GroupManageMember | null>(null);
  const [groupMemberBlockTarget, setGroupMemberBlockTarget] = useState<GroupManageMember | null>(null);
  const [groupMemberActionTarget, setGroupMemberActionTarget] = useState<GroupManageMember | null>(null);
  const [deletedVisibilityTick, setDeletedVisibilityTick] = useState(0);
  const [groupEvents, setGroupEvents] = useState<NativeGroupChatEvent[]>([]);
  const [groupEventMenuOpen, setGroupEventMenuOpen] = useState(false);
  const [groupEventSheetOpen, setGroupEventSheetOpen] = useState(false);
  const [groupEventUserLocationTimeZone, setGroupEventUserLocationTimeZone] = useState(() => canonicalGroupEventTimeZone(deviceTimeZone()));
  const [editingGroupEvent, setEditingGroupEvent] = useState<NativeGroupChatEvent | null>(null);
  const [groupEventBusyId, setGroupEventBusyId] = useState<string | null>(null);
  const [confirmRemoveEvent, setConfirmRemoveEvent] = useState<NativeGroupChatEvent | null>(null);
  const [seriesEventAction, setSeriesEventAction] = useState<{ event: NativeGroupChatEvent; mode: "edit" | "cancel" } | null>(null);
  const [confirmSeriesCancellation, setConfirmSeriesCancellation] = useState<{ event: NativeGroupChatEvent; scope: "occurrence" | "series" } | null>(null);
  const [expandedGroupEventIds, setExpandedGroupEventIds] = useState<Set<string>>(() => new Set());
  const transitionNativeModal = useNativeModalTransition();
  const readQueueRef = useRef<Set<string>>(new Set());
		  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomReadFailureUntilRef = useRef(0);
		  const scrollRef = useRef<ScrollView | null>(null);
	  const loadingOlderRef = useRef(false);
			  const nearBottomRef = useRef(true);
	  const messagesRef = useRef<NativeChatMessage[]>([]);
  const roomIdRef = useRef<string | null>(roomId);
  const loadedRoomIdRef = useRef<string | null>(loadedRoomId);
  const loadedRoomKeyRef = useRef<string | null>(null);
  const dialogueSessionKeyRef = useRef(currentDialogueSessionKey);
  const paramsRef = useRef(params);
  const onNavigateRef = useRef(onNavigate);
	  const attachmentUrlsRef = useRef<Record<string, string | null>>({});
  const linkPreviewsRef = useRef<Record<string, NativeSocialLinkPreview>>({});
  const linkPreviewRequestsRef = useRef<Set<string>>(new Set());
  const roomLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setRefreshing(false);
      setLoadError(true);
      roomLoadGateRef.current = { key: null, inFlight: false, lastStartedAt: 0 };
    },
  });
  const roomMessagesRequestSeqRef = useRef(0);
  const roomMessagesDbConfirmedAtRef = useRef<Map<string, number>>(new Map());
  const membershipRefreshInFlightRef = useRef<Set<string>>(new Set());
  const membershipRefreshLastAtRef = useRef<Map<string, number>>(new Map());
  const membershipRefreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messageMutationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageMutationRefreshTargetRef = useRef<{ roomId: string; sessionKey: string; routeKey: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeNativeProfileSummary(userId, ({ profile }) => {
      const verified = isNativeVerifiedProfile(profile);
      const displayName = String(profile?.display_name || "").trim();
      const avatarUrl = resolveNativeAvatarUrl(typeof profile?.avatar_url === "string" ? profile.avatar_url : null);
      setCurrentUserVerified(verified);
      if (displayName) {
        setSenderNames((current) => ({ ...current, [userId]: displayName }));
      }
      setGroupManageMembers((current) => current.map((member) => member.id === userId
        ? {
          ...member,
          name: displayName || member.name,
          avatarUrl: avatarUrl || member.avatarUrl,
          isVerified: verified,
        }
        : member));
      setGroupOwner((current) => current?.id === userId
        ? {
          ...current,
          displayName: displayName || current.displayName,
          avatarUrl: avatarUrl || current.avatarUrl,
          isVerified: verified,
        }
        : current);
    }, { sessionKey: currentDialogueSessionKey });
  }, [currentDialogueSessionKey, userId]);
  const groupMemberActionTargetRef = useRef<GroupManageMember | null>(null);
  const messageTouchStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const messageYOffsetRef = useRef<Record<string, number>>({});
  const scrollViewportHeightRef = useRef(0);
  const composerHeightRef = useRef(0);
  const editScrimTouchStartYRef = useRef<number | null>(null);
  const readHintRef = useRef<{ roomId: string | null; reported: boolean; unread: number }>({
    roomId,
    reported: false,
    unread: Math.max(0, params.unread || 0),
  });
  const targetHydrationRetryDoneRef = useRef(false);
  const targetScrollDoneRef = useRef(false);
  const targetHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroup = room?.type === "group";
  const isService = room?.type === "service";
  const headerReady = Boolean(room && roomId && room.id === roomId);
  const title = isGroup
    ? room?.name || params.name || "Group"
    : isService
      ? room?.name || params.name || "Care chat"
      : counterpart?.displayName || params.name || "Conversation";
  const memberCountLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  const visibleMessages = useMemo(() => {
    const now = Date.now();
    void deletedVisibilityTick;
    return messages.filter((message) => shouldDisplayChatMessage(message, userId, now));
  }, [deletedVisibilityTick, messages, userId]);
  const sharedGroupDetailsRow = useMemo<NativeChatInboxRow | null>(() => {
    if (!isGroup || !roomId || !room) return null;
    const latestVisibleMessage = visibleMessages[visibleMessages.length - 1];
    return {
      chatId: roomId,
      roomType: "group",
      peerUserId: null,
      peerName: null,
      peerAvatarUrl: null,
      peerIsVerified: false,
      peerHasCar: false,
      peerAvailabilityLabel: null,
      peerSocialId: null,
      blockedByMe: false,
      blockedByThem: false,
      unmatchedByMe: false,
      unmatchedByThem: false,
      matchedAt: null,
      chatName: title,
      avatarUrl: room.avatarUrl,
      memberCount,
      petFocus: room.petFocus || [],
      locationLabel: room.locationLabel,
      locationCountry: room.locationCountry,
      visibility: room.visibility,
      roomCode: room.roomCode,
      joinMethod: room.joinMethod,
      description: room.description,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      lastMessageId: latestVisibleMessage?.id || null,
      lastMessageSenderId: latestVisibleMessage?.senderId || null,
      lastMessageSenderName: null,
      lastMessageContent: latestVisibleMessage?.content || null,
      lastMessageAt: room.lastMessageAt,
      unreadCount: 0,
      lastMessageReadByOther: false,
      serviceStatus: null,
      serviceRequesterId: null,
      serviceProviderId: null,
      serviceRequestCard: null,
      shapeIssue: null,
      activityTs: room.lastMessageAt || room.updatedAt || room.createdAt,
    };
  }, [isGroup, memberCount, room, roomId, title, visibleMessages]);
  const typedPreviewUrl = extractCompletedPreviewUrl(input);
  const activePreviewUrl = lockedPreviewUrl || (typedPreviewUrl && !dismissedPreviewUrls.has(typedPreviewUrl) ? typedPreviewUrl : null);
  const composerDisabled = sending || !chatSafetyResolved || chatDisabledBySafety || blockState !== "none" || unmatchState !== "none";
  const canSendVideo = currentUserTier.trim().toLowerCase() === "gold";
  const uploadBlockingSend = uploads.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "error");
  const uploadProgress = useMemo(() => {
    return averageNativeUploadProgress(uploads);
  }, [uploads]);

  const scrollMessageAboveComposer = useCallback((messageId: string, animated = true) => {
    const y = messageYOffsetRef.current[messageId];
    if (typeof y !== "number") return false;
    const viewportHeight = scrollViewportHeightRef.current || 0;
    const reservedBottom = Math.max(composerHeightRef.current, 76) + huddleSpacing.x8;
    const targetY = viewportHeight > 0
      ? y - Math.max(huddleSpacing.x4, viewportHeight - reservedBottom)
      : y - huddleSpacing.x4;
    scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated });
    return true;
  }, []);

  useEffect(() => {
    targetHydrationRetryDoneRef.current = false;
    targetScrollDoneRef.current = false;
    setHighlightedMessageId(null);
    if (targetHighlightTimerRef.current) {
      clearTimeout(targetHighlightTimerRef.current);
      targetHighlightTimerRef.current = null;
    }
  }, [targetMessageId, roomKey]);

  useEffect(() => {
    const now = Date.now();
    let nextHideIn: number | null = null;
    messages.forEach((message) => {
      if (message.senderId === userId) return;
      const parsed = parseMessageContent(message.content);
      if (parsed.kind !== "deleted") return;
      const remaining = DELETED_MESSAGE_VISIBLE_MS - (now - messageDeletedAtValue(message, parsed));
      if (remaining <= 0) {
        nextHideIn = 0;
        return;
      }
      nextHideIn = nextHideIn === null ? remaining : Math.min(nextHideIn, remaining);
    });
    if (nextHideIn === null) return undefined;
    const timer = setTimeout(() => {
      setDeletedVisibilityTick((current) => current + 1);
    }, Math.max(250, nextHideIn + 250));
    return () => clearTimeout(timer);
  }, [messages, userId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
      requestAnimationFrame(() => {
        if (editingMessageId) {
          scrollMessageAboveComposer(editingMessageId);
          return;
        }
        if (nearBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true });
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [editingMessageId, scrollMessageAboveComposer]);

  const setRoomReadHint = useCallback((targetRoomId: string, unread: number) => {
    const nextUnread = Math.max(0, Math.floor(unread));
    const current = readHintRef.current;
    readHintRef.current = {
      roomId: targetRoomId,
      reported: current.roomId === targetRoomId ? current.reported : false,
      unread: current.roomId === targetRoomId ? Math.max(current.unread, nextUnread) : nextUnread,
    };
  }, []);

  const reportRoomRead = useCallback((targetRoomId: string) => {
    const current = readHintRef.current;
    if (current.roomId !== targetRoomId || current.reported) return;
    if (current.unread > 0) readHintRef.current = { ...current, reported: true };
    onRoomRead?.(targetRoomId, current.unread);
  }, [onRoomRead]);

		  const flushReads = useCallback(async () => {
		    const targetRoomId = roomIdRef.current;
		    if (!targetRoomId || !userId || readQueueRef.current.size === 0) return;
    if (Date.now() < roomReadFailureUntilRef.current) return;
		    const ids = Array.from(readQueueRef.current);
		    readQueueRef.current.clear();
		    try {
			      await markNativeChatMessagesRead({ roomId: targetRoomId, userId, messageIds: ids, accessToken, sessionKey: currentDialogueSessionKey });
			      void invalidateNativeChatReadCaches(userId);
			      reportRoomRead(targetRoomId);
		    } catch {
      roomReadFailureUntilRef.current = Date.now() + ROOM_READ_FAILURE_COOLDOWN_MS;
		      ids.forEach((id) => readQueueRef.current.add(id));
		    }
			  }, [accessToken, currentDialogueSessionKey, reportRoomRead, userId]);

	  useEffect(() => {
	    roomIdRef.current = roomId;
	  }, [roomId]);

  useEffect(() => {
    loadedRoomIdRef.current = loadedRoomId;
  }, [loadedRoomId]);

  useEffect(() => {
    dialogueSessionKeyRef.current = currentDialogueSessionKey;
  }, [currentDialogueSessionKey]);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const isCurrentDialogueRequest = useCallback((requestRoomId: string | null | undefined, requestSessionKey: string) => (
    Boolean(requestRoomId) &&
    roomIdRef.current === requestRoomId &&
    dialogueSessionKeyRef.current === requestSessionKey
  ), []);

  const clearTargetHighlightLater = useCallback((requestRoomId: string, requestSessionKey: string) => {
    if (targetHighlightTimerRef.current) clearTimeout(targetHighlightTimerRef.current);
    targetHighlightTimerRef.current = setTimeout(() => {
      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) setHighlightedMessageId(null);
      targetHighlightTimerRef.current = null;
    }, 2800);
  }, [isCurrentDialogueRequest]);

  const setActiveRoomId = useCallback((nextRoomId: string | null) => {
    roomIdRef.current = nextRoomId;
    readHintRef.current = { roomId: nextRoomId, reported: false, unread: 0 };
    setRoomId(nextRoomId);
  }, []);

  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);

  useEffect(() => {
    linkPreviewsRef.current = linkPreviews;
  }, [linkPreviews]);

  useEffect(() => () => {
    membershipRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    membershipRefreshTimersRef.current.clear();
    if (messageMutationRefreshTimerRef.current) {
      clearTimeout(messageMutationRefreshTimerRef.current);
      messageMutationRefreshTimerRef.current = null;
    }
    if (targetHighlightTimerRef.current) {
      clearTimeout(targetHighlightTimerRef.current);
      targetHighlightTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    groupMemberActionTargetRef.current = groupMemberActionTarget;
  }, [groupMemberActionTarget]);

	  const markCurrentRoomSeen = useCallback((targetRoomId = roomIdRef.current, latestCreatedAt?: string | null) => {
	    if (!targetRoomId || !userId) return;
	    const currentMessages = messagesRef.current;
	    const latest = latestCreatedAt || currentMessages[currentMessages.length - 1]?.createdAt || null;
	    if (!latest) return;
	    void markNativeChatRoomSeen(userId, targetRoomId, latest);
	  }, [userId]);

  const markCurrentRoomRead = useCallback((targetRoomId: string) => {
    if (!targetRoomId || !userId || Date.now() < roomReadFailureUntilRef.current) return;
    void markNativeChatRoomRead({ roomId: targetRoomId, userId, accessToken, sessionKey: currentDialogueSessionKey })
      .then(() => {
        roomReadFailureUntilRef.current = 0;
        void invalidateNativeChatReadCaches(userId);
        reportRoomRead(targetRoomId);
      })
      .catch((error) => {
        roomReadFailureUntilRef.current = Date.now() + ROOM_READ_FAILURE_COOLDOWN_MS;
        logNativeProtectedActionFailure("[native.chat] mark_room_read_failed", error);
      });
  }, [accessToken, currentDialogueSessionKey, reportRoomRead, userId]);

  const latestStarIntro = useMemo(() => {
    if (isGroup) return null;
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      const parsed = parseMessageContent(visibleMessages[index].content);
      if (isStarIntroKind(parsed.kind)) return parsed;
    }
    return null;
  }, [isGroup, visibleMessages]);

  const firstStarUserMessageId = useMemo(() => {
    if (!latestStarIntro?.senderId || isGroup) return null;
    for (const message of visibleMessages) {
      const parsed = parseMessageContent(message.content);
      if (isStarIntroKind(parsed.kind)) continue;
      if (message.senderId !== latestStarIntro.senderId) continue;
      if (parsed.attachments.length === 0 && !parsed.text.trim()) continue;
      return message.id;
    }
    return null;
  }, [isGroup, latestStarIntro?.senderId, visibleMessages]);

  const groupMediaAttachments = useMemo(() => {
    if (!isGroup) return [];
    return visibleMessages
      .flatMap((message) => parseMessageContent(message.content).attachments)
      .map((attachment) => ({
        key: attachment.path || attachment.url,
        mime: attachment.mime,
        uri: attachment.url || (attachment.path ? attachmentUrls[attachment.path] : null),
      }))
      .filter((attachment): attachment is { key: string; mime: string; uri: string } => Boolean(attachment.key && attachment.uri) && !attachment.mime.startsWith("video/"));
  }, [attachmentUrls, isGroup, visibleMessages]);

  const refreshGroupEvents = useCallback(async (targetRoomId = roomIdRef.current) => {
    if (!targetRoomId || room?.type !== "group") {
      setGroupEvents([]);
      return;
    }
    try {
      const rows = await fetchNativeGroupChatEvents(targetRoomId, { accessToken });
      if (!isCurrentDialogueRequest(targetRoomId, dialogueSessionKeyRef.current)) return;
      setGroupEvents(rows);
    } catch {
      if (isCurrentDialogueRequest(targetRoomId, dialogueSessionKeyRef.current)) setGroupEvents([]);
    }
  }, [accessToken, isCurrentDialogueRequest, room?.type]);

  useEffect(() => {
    if (!roomId || room?.type !== "group") {
      setGroupEvents([]);
      return;
    }
    void refreshGroupEvents(roomId);
  }, [refreshGroupEvents, room?.type, roomId]);

  useEffect(() => {
    if (groupEventSheetOpen) return undefined;
    let current = true;
    void readCachedNativeViewerScope(userId, { sessionKey }).then((scope) => {
      if (!current) return;
      const countryKey = String(scope?.countryCode || scope?.countryName || scope?.country || "").trim().toLowerCase();
      setGroupEventUserLocationTimeZone(canonicalGroupEventTimeZone(GROUP_EVENT_SINGLE_ZONE_COUNTRIES[countryKey] || deviceTimeZone()));
    });
    return () => { current = false; };
  }, [groupEventSheetOpen, sessionKey, userId]);

  useEffect(() => {
    if (!roomId || groupEvents.length === 0) return undefined;
    const nextEnd = Math.min(...groupEvents.map((event) => new Date(event.endsAt).getTime()).filter(Number.isFinite));
    if (!Number.isFinite(nextEnd)) return undefined;
    const delay = Math.min(Math.max(250, nextEnd - Date.now() + 250), 24 * 60 * 60 * 1000);
    const timer = setTimeout(() => { void refreshGroupEvents(roomId); }, delay);
    return () => clearTimeout(timer);
  }, [groupEvents, refreshGroupEvents, roomId]);

  const openCreateEventSheet = useCallback(() => {
    setEditingGroupEvent(null);
    setGroupEventSheetOpen(true);
    setGroupEventMenuOpen(false);
  }, []);

  const toggleEventRsvp = useCallback(async (eventId: string) => {
    if (!eventId || groupEventBusyId) return;
    setGroupEventBusyId(eventId);
    try {
      const result = await toggleNativeGroupChatEventRsvp(eventId, { accessToken });
      setGroupEvents((current) => current.map((event) => event.id === eventId ? {
        ...event,
        rsvpCount: result.rsvpCount,
        viewerJoined: result.viewerJoined,
      } : event));
      void refreshGroupEvents();
      haptic.success();
    } catch (error) {
      haptic.error();
      setNotice(nativeSafeErrorCopy(error, "Could not update RSVP."));
    } finally {
      setGroupEventBusyId(null);
    }
  }, [accessToken, groupEventBusyId, refreshGroupEvents]);

  const removeGroupEvent = useCallback(async () => {
    const event = confirmRemoveEvent;
    if (!event) return;
    setGroupEventBusyId(event.id);
    try {
      await removeNativeGroupChatEvent(event.id, { accessToken });
      setConfirmRemoveEvent(null);
      setGroupEvents((current) => current.filter((item) => item.id !== event.id));
      haptic.success();
    } catch (error) {
      haptic.error();
      setNotice(nativeSafeErrorCopy(error, "Could not remove event."));
    } finally {
      setGroupEventBusyId(null);
    }
  }, [accessToken, confirmRemoveEvent]);

  const cancelRecurringGroupEvent = useCallback(async () => {
    const target = confirmSeriesCancellation;
    if (!target) return;
    setGroupEventBusyId(target.event.id);
    try {
      if (target.scope === "series") {
        await cancelNativeGroupEventSeries(target.event.id, { accessToken });
      } else {
        await cancelNativeGroupEventOccurrence(target.event.id, { accessToken });
      }
      setConfirmSeriesCancellation(null);
      await refreshGroupEvents(target.event.chatId);
      haptic.success();
    } catch (error) {
      haptic.error();
      setNotice(nativeSafeErrorCopy(error, target.scope === "series" ? "Could not cancel series." : "Could not cancel event."));
    } finally {
      setGroupEventBusyId(null);
    }
  }, [accessToken, confirmSeriesCancellation, refreshGroupEvents]);

  const queueReads = useCallback((rows: NativeChatMessage[], alreadyReadIds?: Set<string>) => {
    if (!userId) return;
    rows.forEach((message) => {
      if (alreadyReadIds?.has(message.id)) return;
      if (message.senderId !== userId) readQueueRef.current.add(message.id);
    });
    if (readTimerRef.current) return;
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      void flushReads();
    }, MESSAGE_READ_BUFFER_MS);
  }, [flushReads, userId]);

	  const refreshMembershipSnapshot = useCallback(async (targetRoomId: string, requestSessionKey: string) => {
	    if (!userId) return;
    if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	    if (__DEV__) console.debug("[native.chat] membership_snapshot_start", { roomId: targetRoomId });
	    try {
		      const snapshot = await fetchNativeChatDialogueSnapshot({ roomId: targetRoomId, limit: 0, accessToken });
      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	      const roomRow = snapshot.room;
	      const memberRows = snapshot.members;
	      if (roomRow) setRoom(roomRow);
	      setMemberCount(memberRows.length);
		      const profileMap = memberRows.length > 0 ? await fetchProfiles(memberRows.map((member) => member.userId), accessToken) : {};
      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	      if (memberRows.length > 0) {
        setSenderNames((current) => ({ ...current, ...Object.fromEntries(Object.values(profileMap).map((profile) => [profile.id, profile.displayName])) }));
        if (roomRow?.type === "group") setGroupOwner(roomRow.createdBy ? profileMap[roomRow.createdBy] ?? null : null);
      }
      if (roomRow?.type === "group") {
        // Patch groupManageMembers in place — keep sheet content live during background refreshes.
        const memberIdSet = new Set(memberRows.map((m) => m.userId));
        const freshMembers: GroupManageMember[] = memberRows.map((m) => ({
          id: m.userId,
          name: profileMap[m.userId]?.displayName || "User",
          avatarUrl: profileMap[m.userId]?.avatarUrl || null,
          socialId: profileMap[m.userId]?.socialId || null,
          isVerified: profileMap[m.userId]?.isVerified === true,
        }));
        setGroupManageMembers((prev) => {
          if (prev.length === 0) return prev;
          const prevIds = new Set(prev.map((m) => m.id));
          const retained = prev.filter((m) => memberIdSet.has(m.id));
          const added = freshMembers.filter((m) => !prevIds.has(m.id));
          if (retained.length === prev.length && added.length === 0) return prev;
          if (__DEV__) console.debug("[native.chat] membership_patch", { removed: prev.length - retained.length, added: added.length });
          return [...retained, ...added];
        });
        // Clear stale action target if the member has departed.
        const currentTarget = groupMemberActionTargetRef.current;
        if (currentTarget && !memberIdSet.has(currentTarget.id)) {
          if (__DEV__) console.debug("[native.chat] action_target_departed", { memberId: currentTarget.id });
          setGroupMemberActionTarget(null);
          setNotice(`${currentTarget.name} is no longer in this group.`);
        }
      }
      const ownMember = memberRows.find((member) => member.userId === userId);
      if (!ownMember) {
        await clearCachedNativeChatMessages(userId, targetRoomId, { sessionKey: requestSessionKey });
        setMessages([]);
        messagesRef.current = [];
        setReadMessageIds(new Set());
        setAttachmentUrls({});
        setNotice("You no longer have access to this conversation.");
        onNavigate("/chats?tab=groups");
        return;
      }
      if (roomRow?.type === "group") {
		        const { data: memberState } = await nativeExactTokenRpc("get_native_group_member_state", {
		          p_chat_id: targetRoomId,
		        }, accessToken);
        if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	        const row = Array.isArray(memberState) ? memberState[0] as { is_muted?: boolean; role?: string } | undefined : null;
        setGroupMuted(row?.is_muted === true);
        setIsAdmin(roomRow.createdBy === userId || String(row?.role || ownMember?.role || "").toLowerCase() === "admin");
      }
      if (__DEV__) console.debug("[native.chat] membership_snapshot_done", { roomId: targetRoomId, memberCount: memberRows.length });
    } catch (error) {
      logNativeProtectedActionFailure("[native.chat] membership_snapshot_refresh_failed", error);
    }
	  }, [accessToken, isCurrentDialogueRequest, onNavigate, userId]);

	  const scheduleMembershipSnapshotRefresh = useCallback((targetRoomId: string, requestSessionKey: string) => {
	    if (!targetRoomId || membershipRefreshTimersRef.current.has(targetRoomId)) return;
	    const run = () => {
	      membershipRefreshTimersRef.current.delete(targetRoomId);
	      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	      if (membershipRefreshInFlightRef.current.has(targetRoomId)) return;
	      membershipRefreshInFlightRef.current.add(targetRoomId);
	      void refreshMembershipSnapshot(targetRoomId, requestSessionKey).finally(() => {
	        membershipRefreshLastAtRef.current.set(targetRoomId, Date.now());
	        membershipRefreshInFlightRef.current.delete(targetRoomId);
	      });
    };
    const elapsed = Date.now() - (membershipRefreshLastAtRef.current.get(targetRoomId) || 0);
    const delay = Math.max(0, MEMBERSHIP_REALTIME_COOLDOWN_MS - elapsed);
    membershipRefreshTimersRef.current.set(targetRoomId, setTimeout(run, delay));
	  }, [isCurrentDialogueRequest, refreshMembershipSnapshot]);

	  const hydrateMessages = useCallback(async (rows: NativeChatMessage[], options?: { readMessageIds?: Set<string>; requestRoomId?: string | null; requestSeq?: number; requestSessionKey?: string; scrollToLatest?: boolean; source?: "cache" | "db" | "realtime" }) => {
	    const targetRoomId = options?.requestRoomId ?? roomIdRef.current;
	    const requestSessionKey = options?.requestSessionKey ?? dialogueSessionKeyRef.current;
    const requestSeq = options?.requestSeq ?? roomMessagesRequestSeqRef.current;
	    if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
    if (requestSeq !== roomMessagesRequestSeqRef.current) return;
	    messagesRef.current = rows;
	    setMessages(rows);
	    // Reveal messages the instant they paint — don't keep the skeleton up while
	    // the attachment-URL/link-preview/membership tail finishes resolving below.
	    if (rows.length > 0) setLoading(false);
	    if (options?.source !== "cache" && userId && targetRoomId && rows.length > 0 && isCurrentDialogueRequest(targetRoomId, requestSessionKey)) {
      const dbConfirmedAt = Date.now();
      roomMessagesDbConfirmedAtRef.current.set(targetRoomId, dbConfirmedAt);
      void writeCachedNativeChatMessages(userId, targetRoomId, rows, { dbConfirmedAt, sessionKey: requestSessionKey, source: options?.source === "realtime" ? "realtime" : "db" });
    }
	    setFailedAttachmentKeys(new Set());
		    const nextAttachmentUrls = await resolveAttachmentUrls(rows, accessToken, attachmentUrlsRef.current);
	    if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	    setAttachmentUrls(nextAttachmentUrls);
    if (options?.readMessageIds) {
      setReadMessageIds(options.readMessageIds);
    } else {
      setReadMessageIds(new Set());
    }
    const urls = Array.from(new Set(rows.map((message) => {
      const parsed = parseMessageContent(message.content);
      return parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
    }).filter((url): url is string => typeof url === "string" && url.length > 0 && !linkPreviewsRef.current[url] && !linkPreviewRequestsRef.current.has(url))));
	    if (urls.length > 0) {
	      urls.forEach((url) => linkPreviewRequestsRef.current.add(url));
	      const previews = await fetchNativeSocialLinkPreviews(urls);
	      urls.forEach((url) => linkPreviewRequestsRef.current.delete(url));
	      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	      setLinkPreviews((current) => ({ ...current, ...previews }));
	    }
		    queueReads(rows, options?.readMessageIds);
	    if (options?.scrollToLatest !== false) {
	      setTimeout(() => {
	        if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
	        scrollRef.current?.scrollToEnd({ animated: false });
	        markCurrentRoomSeen(targetRoomId, rows[rows.length - 1]?.createdAt || null);
	      }, 80);
	    }
	  }, [accessToken, isCurrentDialogueRequest, markCurrentRoomSeen, queueReads, userId]);

  const loadRoom = useCallback(async (
    targetRoomId: string,
    hintUserId?: string | null,
    options?: { allowCacheHydration?: boolean; routeKey?: string | null; silent?: boolean },
  ) => {
	    if (!userId) return;
	    const requestSessionKey = currentDialogueSessionKey;
    const requestSeq = ++roomMessagesRequestSeqRef.current;
	    const loadKey = `${userId}:${targetRoomId}:${requestSessionKey}:${hintUserId || ""}:${options?.silent ? "silent" : "bootstrap"}`;
	    const now = Date.now();
	    const gate = roomLoadGateRef.current;
	    if (gate.key === loadKey && (gate.inFlight || (options?.silent && now - gate.lastStartedAt < 1200))) return;
	    roomLoadGateRef.current = { key: loadKey, inFlight: true, lastStartedAt: now };
    try {
      let dbMessagesPainted = false;
      const cachedRowsPromise = options?.allowCacheHydration !== false && shouldHydrateCachedMessagesBeforeMembership({ withUserId: params.withUserId, roomId: targetRoomId })
        ? readCachedNativeChatMessages(userId, targetRoomId, { accessChecked: true, sessionKey: requestSessionKey })
        : Promise.resolve<NativeChatMessage[]>([]);
      void cachedRowsPromise.then((cachedRows) => {
        if (dbMessagesPainted || cachedRows.length === 0 || !isCurrentDialogueRequest(targetRoomId, requestSessionKey) || roomMessagesRequestSeqRef.current !== requestSeq) return;
        setHasOlder(cachedRows.length >= INITIAL_MESSAGE_LOAD_SIZE);
        void hydrateMessages(cachedRows.slice(-INITIAL_MESSAGE_LOAD_SIZE), { requestRoomId: targetRoomId, requestSeq, requestSessionKey, source: "cache" });
      });

		      const snapshot = await fetchNativeChatDialogueSnapshot({ roomId: targetRoomId, limit: INITIAL_MESSAGE_LOAD_SIZE + 1, targetMessageId: paramsRef.current.targetMessageId, accessToken });
	      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey) || roomMessagesRequestSeqRef.current !== requestSeq) return;
	      const roomRow = snapshot.room;
	      const memberRows = snapshot.members;
      if (!roomRow) throw new Error("room_not_found");
      if (!memberRows.some((member) => member.userId === userId)) throw new Error("room_not_accessible");
      if (hintUserId && roomRow.type !== "direct") throw new Error("direct_room_type_mismatch");
      setRoom(roomRow);
      setMemberCount(memberRows.length);
      setIsAdmin(roomRow.createdBy === userId);
	      const rows = snapshot.messages;
      const unreadFromSnapshot = rows.reduce((count, message) => (
        message.senderId !== userId &&
        !snapshot.readMessageIds.has(message.id) &&
        !isNativeChatSystemBannerContent(message.content)
          ? count + 1
          : count
      ), 0);
      setRoomReadHint(targetRoomId, Math.max(params.unread || 0, unreadFromSnapshot));
      setHasOlder(rows.length > INITIAL_MESSAGE_LOAD_SIZE);
      dbMessagesPainted = true;
      // The canonical room/messages snapshot is enough for first paint. Profile,
      // viewer and relationship enrichment below must never hold an empty-room
      // conversation behind the three-dot loader.
      setLoading(false);
      void hydrateMessages(rows.slice(-INITIAL_MESSAGE_LOAD_SIZE), {
        readMessageIds: snapshot.readMessageIds,
        requestRoomId: targetRoomId,
        requestSeq,
        requestSessionKey,
        scrollToLatest: !paramsRef.current.targetMessageId,
        source: "db",
      });
      markCurrentRoomRead(targetRoomId);
      setLoadedRoomId(targetRoomId);
      loadedRoomIdRef.current = targetRoomId;
      if (options?.routeKey) loadedRoomKeyRef.current = options.routeKey;

	      const [profileMap, viewerProfile] = await Promise.all([
		        fetchProfiles(memberRows.map((member) => member.userId), accessToken).catch((error) => {
            logNativeProtectedActionFailure("[native.chat] profile_hydration_failed", error);
            return {} as Record<string, ProfileSummary>;
          }),
		        nativeExactTokenRpc<Record<string, unknown>>("get_native_chat_viewer_snapshot", {}, accessToken),
	      ]);
	      if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey) || roomMessagesRequestSeqRef.current !== requestSeq) return;
	      if (viewerProfile.error) logNativeProtectedActionFailure("[native.chat] viewer_snapshot_failed", viewerProfile.error);
      const viewerRow = viewerProfile.data as Record<string, unknown> | null;
      setCurrentUserTier(clean(viewerRow?.effective_tier) || clean(viewerRow?.tier) || "free");
      setCurrentUserVerified(isNativeVerifiedProfile(viewerRow));
      setSenderNames(Object.fromEntries(Object.values(profileMap).map((profile) => [profile.id, profile.displayName])));
      if (roomRow.type === "direct") {
        const otherId = hintUserId && hintUserId !== userId ? hintUserId : memberRows.find((member) => member.userId !== userId)?.userId;
        setCounterpart(otherId ? {
          ...(profileMap[otherId] ?? {
            id: otherId,
            displayName: params.name || "Conversation",
            socialId: null,
            avatarUrl: null,
            availability: "Animal Friend",
            isVerified: false,
            hasCar: false,
          }),
          avatarUrl: profileMap[otherId]?.avatarUrl || routeAvatarHint,
        } : null);
        if (otherId) {
		          const { data: relationship, error: relationshipError } = await nativeExactTokenRpc<Record<string, unknown>>("check_native_direct_relationship", {
		            p_target_user_id: otherId,
		          }, accessToken);
	          if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey) || roomMessagesRequestSeqRef.current !== requestSeq) return;
	          if (relationshipError) throw relationshipError;
          if (relationship?.allowed !== true) {
            throw new Error("direct_relationship_unavailable");
          }
        }
      } else if (roomRow.type === "group") {
		        const { data: memberState } = await nativeExactTokenRpc("get_native_group_member_state", {
		          p_chat_id: targetRoomId,
		        }, accessToken);
	        if (!isCurrentDialogueRequest(targetRoomId, requestSessionKey) || roomMessagesRequestSeqRef.current !== requestSeq) return;
	        const row = Array.isArray(memberState) ? memberState[0] as { is_muted?: boolean; role?: string } | undefined : null;
        setGroupMuted(row?.is_muted === true);
        setIsAdmin(roomRow.createdBy === userId || String(row?.role || "").toLowerCase() === "admin");
        setGroupOwner(roomRow.createdBy ? profileMap[roomRow.createdBy] ?? null : null);
	      }
    } finally {
      if (roomLoadGateRef.current.key === loadKey) roomLoadGateRef.current.inFlight = false;
    }
		  }, [accessToken, currentDialogueSessionKey, hydrateMessages, isCurrentDialogueRequest, markCurrentRoomRead, params.name, params.unread, params.withUserId, routeAvatarHint, setRoomReadHint, userId]);

  const resolveMatchedFallbackTarget = useCallback(async (targetRoomId: string) => {
    if (!userId) return null;
    const { data, error } = await nativeExactTokenRpc<Record<string, unknown>>("get_native_matched_fallback_target", {
      p_chat_id: targetRoomId,
    }, accessToken);
    if (error) throw error;
    const fallback = clean(data?.target_user_id);
    return fallback && fallback !== userId ? fallback : null;
  }, [accessToken, userId]);

  const loadRoomRef = useRef(loadRoom);
  useEffect(() => {
    loadRoomRef.current = loadRoom;
  }, [loadRoom]);

  const resolveMatchedFallbackTargetRef = useRef(resolveMatchedFallbackTarget);
  useEffect(() => {
    resolveMatchedFallbackTargetRef.current = resolveMatchedFallbackTarget;
  }, [resolveMatchedFallbackTarget]);

  const scheduleSilentRoomValidation = useCallback((targetRoomId: string, requestSessionKey: string, targetRouteKey: string | null) => {
    if (!targetRoomId || !isCurrentDialogueRequest(targetRoomId, requestSessionKey)) return;
    messageMutationRefreshTargetRef.current = { roomId: targetRoomId, sessionKey: requestSessionKey, routeKey: targetRouteKey };
    if (messageMutationRefreshTimerRef.current) clearTimeout(messageMutationRefreshTimerRef.current);
    messageMutationRefreshTimerRef.current = setTimeout(() => {
      messageMutationRefreshTimerRef.current = null;
      const target = messageMutationRefreshTargetRef.current;
      messageMutationRefreshTargetRef.current = null;
      if (!target || !isCurrentDialogueRequest(target.roomId, target.sessionKey)) return;
      roomLoadGateRef.current = { key: null, inFlight: false, lastStartedAt: 0 };
      void loadRoomRef.current(target.roomId, paramsRef.current.withUserId, {
        allowCacheHydration: false,
        routeKey: target.routeKey,
        silent: true,
      }).catch(() => {
        if (isCurrentDialogueRequest(target.roomId, target.sessionKey)) setLoadError(true);
      });
    }, MESSAGE_MUTATION_REFRESH_DEBOUNCE_MS);
  }, [isCurrentDialogueRequest]);

	  useEffect(() => {
	    let active = true;
    const currentParams = paramsRef.current;
    const sameLoadedRoom = Boolean(
      loadedRoomKeyRef.current === roomKey &&
      loadedRoomIdRef.current &&
      roomIdRef.current === loadedRoomIdRef.current,
    );
    const hasRouteHandoffShell = Boolean(selectedHandoffRow && selectedHandoffRow.chatId === currentParams.room);
	    if (sameLoadedRoom) {
      setRefreshing(true);
    } else {
	      setLoading(!hasRouteHandoffShell && !currentParams.name);
      setRefreshing(false);
	      setActiveRoomId(null);
	      setLoadedRoomId(hasRouteHandoffShell ? selectedHandoffRow?.chatId || null : null);
      loadedRoomIdRef.current = null;
      loadedRoomKeyRef.current = null;
      if (!hasRouteHandoffShell) setRoom(null);
	      messagesRef.current = [];
	      setMessages([]);
      setSenderNames({});
      if (!hasRouteHandoffShell) setCounterpart(null);
      setGroupOwner(null);
      setMemberCount(hasRouteHandoffShell ? selectedHandoffRow?.memberCount || 0 : 0);
      setIsAdmin(false);
      setGroupMuted(false);
      setBlockState("none");
      setUnmatchState("none");
      setReadMessageIds(new Set());
      setAttachmentUrls({});
      setFailedAttachmentKeys(new Set());
      setLinkPreviews({});
      setInput("");
      setUploads([]);
      setHasOlder(false);
      setShowLatest(false);
    }
    setLoadError(false);
    setChatSafetyResolved(false);
    setNotice(null);
    void (async () => {
      try {
        if (!userId) {
          onNavigateRef.current("/auth");
          return;
        }
        const safetyPromise = isNativeRestrictionActive("chat_disabled")
          .then((disabled) => {
            if (active) setChatDisabledBySafety(disabled);
          })
          .catch(() => {
            // Fail closed for sending, but do not block the cached conversation
            // from painting while the restriction service recovers.
            if (active) setChatDisabledBySafety(true);
          })
          .finally(() => {
            if (active) setChatSafetyResolved(true);
          });
        let targetRoomId = currentParams.room;
        if (currentParams.withUserId) {
	          targetRoomId = await ensureNativeDirectChatRoom(currentParams.withUserId, currentParams.name || "Conversation", { accessToken, actorId: userId });
	          if (active) setActiveRoomId(targetRoomId);
	        }
	        if (!targetRoomId) throw new Error("missing_room");
	        if (!active) return;
	        setActiveRoomId(targetRoomId);
        try {
          await loadRoomRef.current(targetRoomId, currentParams.withUserId, {
            allowCacheHydration: !sameLoadedRoom,
            routeKey: roomKey,
            silent: sameLoadedRoom,
          });
        } catch (error) {
          if (!currentParams.room) throw error;
	          const hintedSnapshot = await fetchNativeChatDialogueSnapshot({ roomId: currentParams.room, limit: 0, accessToken });
          const hintedRoom = hintedSnapshot.room;
          if (hintedRoom?.type === "group" || hintedRoom?.type === "service") throw error;
          const fallbackTargetId = currentParams.withUserId || await resolveMatchedFallbackTargetRef.current(currentParams.room);
          if (!fallbackTargetId) throw error;
	          const fallbackRoomId = await ensureNativeDirectChatRoom(fallbackTargetId, currentParams.name || "Conversation", { accessToken, actorId: userId });
          if (!active) return;
	          setActiveRoomId(fallbackRoomId);
	          await loadRoomRef.current(fallbackRoomId, fallbackTargetId, {
              allowCacheHydration: !sameLoadedRoom,
              routeKey: roomKey,
              silent: sameLoadedRoom,
            });
        }
        await safetyPromise;
      } catch {
        if (active) {
          if (!sameLoadedRoom && currentParams.room && userId) await clearCachedNativeChatMessages(userId, currentParams.room, { sessionKey: currentDialogueSessionKey }).catch(() => undefined);
          setLoadError(true);
        }
      } finally {
        if (active && !sameLoadedRoom) setLoading(false);
        if (active && sameLoadedRoom) setRefreshing(false);
      }
    })();
    return () => { active = false; };
	  }, [accessToken, currentDialogueSessionKey, loadRetryKey, roomKey, selectedHandoffRow, setActiveRoomId, userId]);

	  useEffect(() => {
	    if (!roomId || !userId) return;
	    const subscriptionRoomId = roomId;
	    const subscriptionSessionKey = currentDialogueSessionKey;
	    const isCurrentRealtimeSubscription = () => isCurrentDialogueRequest(subscriptionRoomId, subscriptionSessionKey);
	    const roomHandle = createSinglePrivateBroadcastChannel(
        `native-chat-dialogue-room:${subscriptionRoomId}`,
        `room:${subscriptionRoomId}`,
        () => {
          if (!isCurrentRealtimeSubscription()) return;
          void clearCachedNativeChatMessages(userId, subscriptionRoomId, { sessionKey: subscriptionSessionKey });
          scheduleMembershipSnapshotRefresh(subscriptionRoomId, subscriptionSessionKey);
          scheduleSilentRoomValidation(subscriptionRoomId, subscriptionSessionKey, loadedRoomKeyRef.current);
          void refreshGroupEvents(subscriptionRoomId);
        },
        (status) => {
          if (status !== "SUBSCRIBED" || !isCurrentRealtimeSubscription()) return;
          scheduleMembershipSnapshotRefresh(subscriptionRoomId, subscriptionSessionKey);
          scheduleSilentRoomValidation(subscriptionRoomId, subscriptionSessionKey, loadedRoomKeyRef.current);
          void refreshGroupEvents(subscriptionRoomId);
        },
	    );
	    const readsHandle = createSingleRealtimeChannel(`native-chat-dialogue-reads:${subscriptionRoomId}`, (channel) =>
	      channel.on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `chat_id=eq.${subscriptionRoomId}` }, (payload) => {
	        if (!isCurrentRealtimeSubscription()) return;
	        const row = payload.new as { chat_id?: string; message_id?: string; user_id?: string } | null;
	        if (!row?.message_id || row.user_id === userId || row.chat_id && row.chat_id !== subscriptionRoomId) return;
	        const sentIds = new Set(messagesRef.current.filter((message) => message.senderId === userId).map((message) => message.id));
	        if (!sentIds.has(row.message_id)) return;
	        setReadMessageIds((current) => (isCurrentRealtimeSubscription() ? new Set([...current, row.message_id!]) : current));
        scheduleSilentRoomValidation(subscriptionRoomId, subscriptionSessionKey, loadedRoomKeyRef.current);
	      }),
	    );
    return () => {
      void roomHandle.dispose();
      void readsHandle.dispose();
      void flushReads();
    };
		  }, [accessToken, currentDialogueSessionKey, flushReads, isCurrentDialogueRequest, markCurrentRoomSeen, queueReads, refreshGroupEvents, roomId, scheduleMembershipSnapshotRefresh, scheduleSilentRoomValidation, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const foregroundRoomId = roomId;
    const foregroundSessionKey = currentDialogueSessionKey;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      scheduleSilentRoomValidation(foregroundRoomId, foregroundSessionKey, loadedRoomKeyRef.current);
    });
    return () => subscription.remove();
  }, [currentDialogueSessionKey, roomId, scheduleSilentRoomValidation, userId]);

  useEffect(() => {
    if (!activePreviewUrl || linkPreviews[activePreviewUrl]) return;
    if (linkPreviewRequestsRef.current.has(activePreviewUrl)) return;
    linkPreviewRequestsRef.current.add(activePreviewUrl);
    void fetchNativeSocialLinkPreviews([activePreviewUrl]).then((next) => {
      if (Object.keys(next).length > 0) setLinkPreviews((current) => ({ ...current, ...next }));
    }).finally(() => {
      linkPreviewRequestsRef.current.delete(activePreviewUrl);
    });
  }, [activePreviewUrl, linkPreviews]);

  useEffect(() => {
    if (!typedPreviewUrl || dismissedPreviewUrls.has(typedPreviewUrl)) return;
    const preview = linkPreviews[typedPreviewUrl];
    if (!preview || "failed" in preview && preview.failed) return;
    setLockedPreviewUrl(typedPreviewUrl);
    setInput((current) => stripUrl(current, typedPreviewUrl));
  }, [dismissedPreviewUrls, linkPreviews, typedPreviewUrl]);

	  const loadOlder = useCallback(async () => {
	    if (!roomId || loadingOlderRef.current || loadingOlder || !hasOlder || messages.length === 0) return;
	    const requestRoomId = roomId;
	    const requestSessionKey = currentDialogueSessionKey;
	    loadingOlderRef.current = true;
	    setLoadingOlder(true);
	    try {
		      const snapshot = await fetchNativeChatDialogueSnapshot({ roomId: requestRoomId, beforeCreatedAt: messages[0].createdAt, limit: OLDER_MESSAGE_PAGE_SIZE + 1, accessToken });
	      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
	      const rows = snapshot.messages;
	      setHasOlder(rows.length > OLDER_MESSAGE_PAGE_SIZE);
	      const older = rows.length > OLDER_MESSAGE_PAGE_SIZE ? rows.slice(rows.length - OLDER_MESSAGE_PAGE_SIZE) : rows;
	      const next = mergeNativeChatMessages(older, messagesRef.current);
	      await hydrateMessages(next, { requestRoomId, requestSessionKey, scrollToLatest: false });
	    } catch {
	      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) setNotice("Unable to load older messages.");
	    } finally {
	      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) {
	        loadingOlderRef.current = false;
	        setLoadingOlder(false);
	      }
	    }
	  }, [accessToken, currentDialogueSessionKey, hasOlder, hydrateMessages, isCurrentDialogueRequest, loadingOlder, messages, roomId]);

  useEffect(() => {
    if (!targetMessageId || !roomId || loading) return;
    const requestRoomId = roomId;
    const requestSessionKey = currentDialogueSessionKey;
    const target = visibleMessages.find((message) => message.id === targetMessageId);
    if (target) {
      if (targetScrollDoneRef.current) return;
      const scrollToTarget = () => {
        if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
        if (!scrollMessageAboveComposer(targetMessageId)) return;
        targetScrollDoneRef.current = true;
        setHighlightedMessageId(targetMessageId);
        clearTargetHighlightLater(requestRoomId, requestSessionKey);
      };
      requestAnimationFrame(scrollToTarget);
      setTimeout(scrollToTarget, 180);
      setTimeout(scrollToTarget, 420);
      return;
    }

    if (targetHydrationRetryDoneRef.current) return;
    targetHydrationRetryDoneRef.current = true;
    void (async () => {
      try {
        const snapshot = await fetchNativeChatDialogueSnapshot({
          roomId: requestRoomId,
          limit: INITIAL_MESSAGE_LOAD_SIZE + OLDER_MESSAGE_PAGE_SIZE + 1,
          targetMessageId,
          accessToken,
        });
        if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
        const next = mergeNativeChatMessages(messagesRef.current, snapshot.messages);
        await hydrateMessages(next, {
          readMessageIds: snapshot.readMessageIds,
          requestRoomId,
          requestSessionKey,
          scrollToLatest: false,
          source: "db",
        });
      } catch {
        if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) {
          setNotice("Opened Team huddle chat. The linked message is not available yet.");
        }
      }
    })();
  }, [accessToken, clearTargetHighlightLater, currentDialogueSessionKey, hydrateMessages, isCurrentDialogueRequest, loading, messages, roomId, scrollMessageAboveComposer, targetMessageId, visibleMessages]);

  const uploadPendingMedia = useCallback(async (item: PendingMedia, requestRoomId: string, requestSessionKey: string) => {
    if (!userId) return;
    setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_START), status: "uploading" } : entry));
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    try {
      progressTimer = setInterval(() => {
        setUploads((current) => current.map((entry) => {
          if (entry.uri !== item.uri || entry.status !== "uploading") return entry;
          return { ...entry, progress: nextNativeUploadProgress(entry.progress) };
        }));
      }, 450);
      const isImage = item.mime.startsWith("image/");
      // Library-picked photos can be 10MP+; base64-encoding the raw file synchronously freezes
      // the JS thread for several seconds (an app hang). Resize/compress images first, matching
      // every other native upload path (care evidence, broadcast alerts, profile photos). Videos
      // pass through untouched -- manipulateAsync only handles images.
      const normalized = isImage
        ? await manipulateAsync(item.uri, [{ resize: { width: 1600 } }], { compress: 0.86, format: SaveFormat.JPEG })
        : null;
      const sourceUri = normalized?.uri || item.uri;
      let file: Awaited<ReturnType<typeof readNativeLocalMediaFile>>;
      try {
        file = await readNativeLocalMediaFile(
          sourceUri,
          { fileName: item.name, mimeType: isImage ? "image/jpeg" : item.mime },
          {
            allowedKinds: [isImage ? "image" : "video"],
            fallbackContentType: isImage ? "image/jpeg" : (item.mime || "application/octet-stream"),
            fallbackExtension: isImage ? "jpg" : "mp4",
            maxBytes: NATIVE_CHAT_MEDIA_MAX_BYTES,
            oversizedMessage: isImage
              ? "This photo is still over 25 MB after compression. Choose another photo."
              : "This video is over 25 MB. Choose a shorter or lower-quality video.",
          },
        );
      } finally {
        if (normalized && normalized.uri !== item.uri && normalized.uri.startsWith("file://")) {
          await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
        }
      }
      setUploads((current) => current.map((entry) => entry.uri === item.uri && entry.status === "uploading" ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_READ_READY) } : entry));
      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
      setUploads((current) => current.map((entry) => entry.uri === item.uri && entry.status === "uploading" ? { ...entry, progress: Math.max(entry.progress, NATIVE_UPLOAD_PROGRESS_UPLOAD_READY) } : entry));
      const attachment = await uploadNativeChatAttachment({
        userId,
        roomId: requestRoomId,
        fileName: item.name,
        mime: file.contentType || item.mime,
        body: file.body,
        size: file.size,
        accessToken,
        sessionKey: requestSessionKey,
      });
      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
      setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 100, status: "uploaded", attachment } : entry));
    } catch (error) {
      logNativeProtectedActionFailure("[native.chat] preupload_attachment_failed", error);
      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) {
        setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, progress: 0, status: "error" } : entry));
        setNotice(nativeSafeErrorCopy(error, "Couldn't upload that media. Remove it or try again."));
      }
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
  }, [accessToken, isCurrentDialogueRequest, userId]);

  const pickMedia = useCallback(async () => {
    if (composerDisabled) return;
    let selected: PendingMedia[];
    try {
      // Best-effort request; PHPicker presents regardless, so never hard-block.
      const result = await launchNativeImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: canSendVideo ? ["images", "videos"] : ["images"],
        orderedSelection: true,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.86,
        selectionLimit: 10 - uploads.length,
      });
      if (result.canceled) return;
      selected = result.assets.map((asset, index) => ({
        height: asset.height,
        uri: asset.uri,
        name: asset.fileName || `media-${Date.now()}-${index}`,
        mime: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
        progress: 0,
        size: asset.fileSize ?? null,
        status: "queued" as const,
        width: asset.width,
      }));
    } catch (error) {
      setNotice(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
      return;
    }
    if (!canSendVideo && selected.some((asset) => asset.mime.startsWith("video/"))) {
      setNotice("Video upload is for huddle＊ members only.");
    }
    const hasOversizedVideo = selected.some((asset) => asset.mime.startsWith("video/") && typeof asset.size === "number" && asset.size > NATIVE_CHAT_MEDIA_MAX_BYTES);
    if (hasOversizedVideo) setNotice("This video is over 25 MB. Choose a shorter or lower-quality video.");
    const filtered = selected.filter((asset) => (
      (canSendVideo || !asset.mime.startsWith("video/"))
      && !(asset.mime.startsWith("video/") && typeof asset.size === "number" && asset.size > NATIVE_CHAT_MEDIA_MAX_BYTES)
    ));
    setUploads((current) => [
      ...current,
      ...filtered,
    ].slice(0, 10));
    const requestRoomId = roomIdRef.current;
    const requestSessionKey = dialogueSessionKeyRef.current;
    if (!requestRoomId || !userId) {
      setUploads((current) => current.map((entry) => filtered.some((item) => item.uri === entry.uri) ? { ...entry, status: "error" } : entry));
      return;
    }
    filtered.forEach((item) => {
      void uploadPendingMedia(item, requestRoomId, requestSessionKey);
    });
  }, [canSendVideo, composerDisabled, uploadPendingMedia, uploads.length, userId]);

	  const submitMessage = useCallback(async () => {
	    if (!roomId || !userId || composerDisabled) return;
	    const requestRoomId = roomId;
	    const requestSessionKey = currentDialogueSessionKey;
	    const text = input.trim();
    const media = uploads;
    const previewUrl = activePreviewUrl;
    if (!text && media.length === 0 && !previewUrl) return;
    if (media.some((item) => item.status !== "uploaded" || !item.attachment)) {
      setNotice("Wait for images to finish uploading before sending.");
      return;
    }
    if (editingMessageId) {
      const target = messagesRef.current.find((message) => message.id === editingMessageId && message.senderId === userId);
      if (!target) {
        setEditingMessageId(null);
        return;
      }
      try {
        setSending(true);
        const previousAttachments = parseMessageContent(target.content).attachments.filter((attachment) => Boolean(attachment.path));
        const uploadedAttachments: NativeChatAttachment[] = media
          .map((item) => item.attachment)
          .filter((attachment): attachment is NativeChatAttachment => Boolean(attachment?.path));
        const content = JSON.stringify({
          text,
          attachments: uploadedAttachments,
          linkPreviewUrl: previewUrl,
          kind: parseMessageContent(target.content).kind,
        });
        const { data, error } = await nativeExactTokenRpc<unknown[]>("update_native_chat_message_content", {
          p_message_id: target.id,
          p_content: content,
        }, accessToken);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : null;
        const updated: NativeChatMessage = row && typeof row === "object" ? {
          id: String((row as Record<string, unknown>).id || target.id),
          chatId: String((row as Record<string, unknown>).chat_id || target.chatId),
          senderId: String((row as Record<string, unknown>).sender_id || target.senderId),
          content: String((row as Record<string, unknown>).content || content),
          createdAt: String((row as Record<string, unknown>).created_at || target.createdAt),
          updatedAt: String((row as Record<string, unknown>).created_at || target.updatedAt || target.createdAt),
        } : { ...target, content, updatedAt: new Date().toISOString() };
        setInput("");
        setLockedPreviewUrl(null);
        setUploads([]);
        setEditingMessageId(null);
        setOpenMessageActionsId(null);
        await hydrateMessages(messagesRef.current.map((message) => message.id === target.id ? updated : message), { requestRoomId, requestSessionKey, scrollToLatest: false });
        const nextAttachmentPaths = new Set(uploadedAttachments.map((attachment) => attachment.path).filter(Boolean));
        const removedAttachmentPaths = previousAttachments
          .map((attachment) => attachment.path)
          .filter((path): path is string => Boolean(path && !nextAttachmentPaths.has(path)));
        if (removedAttachmentPaths.length > 0) {
          void Promise.allSettled(removedAttachmentPaths.map((path) => deleteOwnNativeChatAttachment({
            accessToken,
            path,
            sessionKey: requestSessionKey,
            userId,
          }))).then((results) => {
            results.forEach((result) => {
              if (result.status === "rejected") logNativeProtectedActionFailure("[native.chat] edit_message_attachment_cleanup_failed", result.reason);
            });
          });
        }
        haptic.success();
      } catch (error) {
        logNativeProtectedActionFailure("[native.chat] edit_message_failed", error);
        setNotice("Unable to edit message right now.");
      } finally {
        setSending(false);
      }
      return;
    }
    if (!canSendVideo && media.some((item) => item.mime.startsWith("video/"))) {
      setUploads((current) => current.filter((item) => !item.mime.startsWith("video/")));
      setNotice("Video upload is for huddle＊ members only.");
      return;
    }
    haptic.primaryConfirm(); // CD2: optimistic send-confirmation haptic
    setSending(true);
    const uploadedAttachments: NativeChatAttachment[] = media
      .map((item) => item.attachment)
      .filter((attachment): attachment is NativeChatAttachment => Boolean(attachment));
    const clientMessageId = createNativeChatClientMessageId();
    const pendingId = `pending:${requestRoomId}:${clientMessageId}`;
    const pendingPayload = JSON.stringify({ text: previewUrl ? stripUrl(text, previewUrl) : text, attachments: uploadedAttachments, linkPreviewUrl: previewUrl, client_message_id: clientMessageId });
    const pendingMessage: NativeChatMessage = {
      id: pendingId,
      chatId: requestRoomId,
      senderId: userId,
      content: pendingPayload,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      localStatus: "pending",
    };
    if (__DEV__) console.log("NATIVE_CHAT_SEND_TAP", {
      hasAccessToken: Boolean(accessToken),
      hasMedia: media.length > 0,
      pendingId,
      roomId: requestRoomId,
    });
    // A-ha moment: first message in a brand-new direct match (Bumble model).
    const wasFirstDirectMessage = routeMode === "direct" && messagesRef.current.length === 0;
    setMessages((current) => {
      const next = mergeNativeChatMessages(current, [pendingMessage]);
      messagesRef.current = next;
      return next;
    });
    setInput("");
    setUploads([]);
    setLockedPreviewUrl(null);
    setDismissedPreviewUrls(new Set());
    setTimeout(() => {
      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) scrollRef.current?.scrollToEnd({ animated: true });
    }, 0);
    try {
			      const sent = await sendNativeChatMessage({ roomId: requestRoomId, senderId: userId, content: pendingPayload, accessToken, sessionKey: requestSessionKey });
	      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
      setUploads([]);
      if (__DEV__) console.log("NATIVE_CHAT_SEND_REPLACE_PENDING", {
        messageId: sent.id,
        pendingId,
        roomId: requestRoomId,
      });
	      await hydrateMessages(replacePendingNativeChatMessage(messagesRef.current, pendingId, sent), { requestRoomId, requestSessionKey });
	      haptic.success();
      if (wasFirstDirectMessage) {
        void recordAppReviewInteraction(userId);
        void requestAppReview({ userId, trigger: "first_match_message" });
      }
    } catch (error) {
      logNativeProtectedActionFailure("[native.chat] send_message_failed", error);
      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) {
        const stillPending = messagesRef.current.some((message) => message.id === pendingId);
        if (__DEV__) console.warn("NATIVE_CHAT_SEND_ROLLBACK", {
          message: error instanceof Error ? error.message : String(error),
          pendingId,
          preservedInput: true,
          rollbackHappened: true,
          roomId: requestRoomId,
        });
	        if (stillPending) {
          setMessages((current) => {
            const next = failNativeChatOutboxMessage(current, pendingId).messages;
            messagesRef.current = next;
            return next;
          });
	          setNotice("Couldn't send your message.");
	        }
	      }
	    } finally {
	      if (isCurrentDialogueRequest(requestRoomId, requestSessionKey)) setSending(false);
	    }
	  }, [accessToken, activePreviewUrl, canSendVideo, composerDisabled, currentDialogueSessionKey, editingMessageId, hydrateMessages, input, isCurrentDialogueRequest, roomId, routeMode, uploads, userId]);

  const retryFailedMessage = useCallback(async (message: NativeChatMessage) => {
    if (!roomId || !userId || message.chatId !== roomId || message.senderId !== userId) return;
    const requestRoomId = roomId;
    const requestSessionKey = currentDialogueSessionKey;
    const retry = beginNativeChatOutboxRetry(messagesRef.current, message.id);
    if (!retry.transitioned) return;
    messagesRef.current = retry.messages;
    setMessages(retry.messages);
    try {
      const sent = await sendNativeChatMessage({
        roomId: requestRoomId,
        senderId: userId,
        content: message.content,
        accessToken,
        sessionKey: requestSessionKey,
      });
      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
      const reconciled = reconcileNativeChatOutboxMessage(messagesRef.current, message.id, sent);
      messagesRef.current = reconciled.messages;
      await hydrateMessages(reconciled.messages, { requestRoomId, requestSessionKey });
      haptic.success();
    } catch (error) {
      logNativeProtectedActionFailure("[native.chat] retry_message_failed", error);
      if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
      const failed = failNativeChatOutboxMessage(messagesRef.current, message.id);
      messagesRef.current = failed.messages;
      setMessages(failed.messages);
      if (failed.transitioned) setNotice("Couldn't send your message.");
    }
  }, [accessToken, currentDialogueSessionKey, hydrateMessages, isCurrentDialogueRequest, roomId, userId]);

  const dismissFailedMessage = useCallback((message: NativeChatMessage) => {
    const dismissed = dismissNativeChatOutboxMessage(messagesRef.current, message.id);
    if (!dismissed.transitioned) return;
    messagesRef.current = dismissed.messages;
    setMessages(dismissed.messages);
    // A timed-out request may still have reached the server. Keep its uploaded
    // attachments so dismissing the local retry card cannot break that message.
  }, []);

  const toggleBlock = useCallback(async () => {
    if (!counterpart?.id) return;
    if (blockState === "blocked_by_me") haptic.primaryConfirm();
    else haptic.destructive();
    try {
      const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
      const { error } = await nativeExactTokenRpc(fn, { p_blocked_id: counterpart.id }, accessToken);
      if (error) throw error;
      setBlockState(blockState === "blocked_by_me" ? "none" : "blocked_by_me");
      void invalidateNativeBlockCascade({ userId, roomId, clearRoomMessages: blockState !== "blocked_by_me" })
        .catch((cleanupError) => logNativeProtectedActionFailure("[native.chat] block_cache_cleanup_failed", cleanupError));
    } catch {
      setNotice("Unable to update block status right now.");
    } finally {
      setConfirmBlockOpen(false);
    }
  }, [accessToken, blockState, counterpart?.id, roomId, userId]);

  const blockGroupMember = useCallback(async () => {
    if (!groupMemberBlockTarget || groupMemberBlockTarget.id === userId) return;
    haptic.destructive();
    try {
      const { error } = await nativeExactTokenRpc("block_user", { p_blocked_id: groupMemberBlockTarget.id }, accessToken);
      if (error) throw error;
      void invalidateNativeBlockCascade({ userId })
        .catch((cleanupError) => logNativeProtectedActionFailure("[native.chat] block_cache_cleanup_failed", cleanupError));
    } catch {
      setNotice("Unable to block this member right now.");
    } finally {
      setGroupMemberBlockTarget(null);
    }
  }, [accessToken, groupMemberBlockTarget, userId]);

  const unmatch = useCallback(async () => {
    if (!counterpart?.id) return;
    haptic.destructive();
    try {
      const { error } = await nativeExactTokenRpc("unmatch_user_one_sided", { p_other_user_id: counterpart.id }, accessToken);
      if (error) throw error;
      invalidateNativeDiscoveryRelationshipCache(userId);
      invalidateNativeMatchedRailSummary(userId);
      if (userId) publishNativeChatUnmatchCommitted({ actorUserId: userId, chatId: roomId, peerUserId: counterpart.id });
      onNavigate("/chats?tab=friends");
      if (userId && roomId) {
        void clearCachedNativeChatMessages(userId, roomId)
          .catch((cleanupError) => logNativeProtectedActionFailure("[native.chat] unmatch_cache_cleanup_failed", cleanupError));
      }
    } catch {
      setNotice("Unable to unmatch right now.");
    } finally {
      setConfirmUnmatchOpen(false);
    }
  }, [accessToken, counterpart?.id, onNavigate, roomId, userId]);

  const toggleMute = useCallback(async () => {
    if (!roomId || !userId) return;
    const next = !groupMuted;
    setGroupMuted(next);
    try {
      const { error } = await nativeExactTokenRpc("set_group_mute_state", {
        p_chat_id: roomId,
        p_muted: next,
      }, accessToken);
      if (error) throw error;
    } catch {
      setGroupMuted(!next);
      setNotice("Unable to update notifications right now.");
    }
  }, [accessToken, groupMuted, roomId, userId]);

  const loadGroupManageData = useCallback(async () => {
    if (!roomId || !userId) return;
    if (groupManagement) return;
    setGroupManageLoading(true);
    setGroupManagementLoading(true);
    setGroupManagementError(false);
    try {
      const management = await fetchNativeGroupManagementSnapshot(roomId, { accessToken });
      setGroupManagement(management);
      const { data, error } = await nativeExactTokenRpc("get_native_group_manage_snapshot", {
        p_chat_id: roomId,
      }, accessToken);
      if (error) throw error;
      const snapshot = data && typeof data === "object" ? data as Record<string, unknown> : {};
      setGroupManageMembers((Array.isArray(snapshot.members) ? snapshot.members : []).map(mapGroupManageMember).filter((item): item is GroupManageMember => Boolean(item)));
      setGroupManageFriends((Array.isArray(snapshot.friends) ? snapshot.friends : []).map(mapGroupManageMember).filter((item): item is GroupManageMember => Boolean(item)));
    } catch {
      setGroupManagementError(true);
      setNotice("Couldn't load group members.");
    } finally {
      setGroupManageLoading(false);
      setGroupManagementLoading(false);
    }
  }, [accessToken, groupManagement, roomId, userId]);

  const openGroupInfoSheet = useCallback(() => {
    if (!roomId) return;
    setGroupInfoOpen(true);
    void loadGroupManageData();
  }, [loadGroupManageData, roomId]);

  const saveGroupName = useCallback(async () => {
    if (!roomId || !isAdmin) return;
    if (!groupNameEditing) {
      setGroupNameDraft(title);
      setGroupNameEditing(true);
      return;
    }
    const nextName = groupNameDraft.trim();
    if (!nextName) {
      setNotice("Don't skip this one!");
      return;
    }
    setGroupNameSaving(true);
    try {
      const row = await updateNativeGroupChatMetadata({
        roomId,
        name: nextName,
        updateName: true,
        accessToken,
      });
      const savedName = row?.name ?? nextName;
      setRoom((current) => current ? { ...current, name: savedName } : current);
      setGroupNameDraft(savedName);
      void patchCachedNativeChatInboxGroupRows({ chatId: roomId, patch: { chatName: savedName }, sessionKey: currentDialogueSessionKey, userId });
      setGroupNameEditing(false);
    } catch {
      setNotice("Couldn't save group name.");
    } finally {
      setGroupNameSaving(false);
    }
  }, [accessToken, currentDialogueSessionKey, groupNameDraft, groupNameEditing, isAdmin, roomId, title, userId]);

  const saveGroupDescription = useCallback(async () => {
    if (!roomId) return;
    if (!groupDescriptionEditing) {
      setGroupDescriptionEditing(true);
      return;
    }
    setGroupDescriptionSaving(true);
    try {
      const row = await updateNativeGroupChatMetadata({
        roomId,
        description: groupDescriptionDraft.trim() || null,
        updateDescription: true,
        accessToken,
      });
      const savedDescription = row?.description ?? (groupDescriptionDraft.trim() || null);
      setRoom((current) => current ? { ...current, description: savedDescription } : current);
      void patchCachedNativeChatInboxGroupRows({ chatId: roomId, patch: { description: savedDescription }, sessionKey: currentDialogueSessionKey, userId });
      setGroupDescriptionEditing(false);
    } catch {
      setNotice("Couldn't save group description.");
    } finally {
      setGroupDescriptionSaving(false);
    }
  }, [accessToken, currentDialogueSessionKey, groupDescriptionDraft, groupDescriptionEditing, roomId, userId]);

  const saveSharedGroupDetails = useCallback(async () => {
    if (!roomId || !isAdmin) return;
    const nextName = groupNameDraft.trim();
    const nextDescription = groupDescriptionDraft.trim();
    const nextLocation = groupLocationDraft.trim();
    const nextErrors = {
      description: countWords(nextDescription) > GROUP_DESCRIPTION_WORD_LIMIT,
      name: !nextName,
    };
    setGroupDetailsErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    try {
      const row = await updateNativeGroupChatMetadata({
        roomId,
        name: nextName,
        description: nextDescription || null,
        locationLabel: nextLocation || null,
        petFocus: groupPetFocusDraft,
        updateName: true,
        updateDescription: true,
        updateLocation: true,
        updatePetFocus: true,
        accessToken,
      });
      const patch = {
        chatName: row?.name ?? nextName,
        name: row?.name ?? nextName,
        description: row?.description ?? (nextDescription || null),
        locationLabel: row?.locationLabel ?? (nextLocation || null),
        petFocus: row?.petFocus ?? groupPetFocusDraft,
      };
      setRoom((current) => current ? {
        ...current,
        name: patch.name,
        description: patch.description,
        locationLabel: patch.locationLabel,
        petFocus: patch.petFocus,
      } : current);
      void patchCachedNativeChatInboxGroupRows({ chatId: roomId, patch, sessionKey: currentDialogueSessionKey, userId });
      setGroupDetailsErrors({});
    } catch {
      setNotice("Couldn't save group details.");
    }
  }, [accessToken, currentDialogueSessionKey, groupDescriptionDraft, groupLocationDraft, groupNameDraft, groupPetFocusDraft, isAdmin, roomId, userId]);

  // Pick → 16:9 crop, then upload the cropped result. Uses the shared non-blocking
  // picker (no permission hard-block) and the same cropper as profile/pet/groups.
  const updateGroupAvatar = useCallback(async () => {
    if (!roomId || !userId || !isAdmin || groupAvatarBusy) return;
    try {
      const picked = await pickNativeProfilePhoto({ soloAspect: "16:9" });
      const asset = picked?.asset;
      if (!asset?.uri || !asset.width || !asset.height) return;
      setGroupCoverCropAsset({
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        fileSize: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        width: asset.width,
        height: asset.height,
      });
    } catch (error) {
      setNotice(nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again."));
    }
  }, [groupAvatarBusy, isAdmin, roomId, userId]);

  const uploadCroppedGroupCover = useCallback(async (cropped: NativeProfileUploadAsset) => {
    const croppedUri = cropped.uri || "";
    setGroupCoverCropAsset(null);
    if (!croppedUri || !roomId || !userId || !isAdmin || groupAvatarBusy) return;
    setGroupAvatarBusy("upload");
    let uploadedPath: string | null = null;
    try {
      const compressed = await manipulateAsync(croppedUri, [{ resize: { width: 1280 } }], {
        compress: 0.6,
        format: SaveFormat.JPEG,
      });
      const file = await readNativeLocalMediaFile(compressed.uri, { fileName: "group-cover.jpg", mimeType: "image/jpeg" }, { fallbackContentType: "image/jpeg", fallbackExtension: "jpg" });
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const path = `groups/${roomId}/cover-${uploadId}.jpg`;
      uploadedPath = path;
      await uploadNativeChatStorageObject({ accessToken, bucket: "avatars", path, body: file.body, contentType: file.contentType || "image/jpeg", upsert: true });
      const { error: registerError } = await nativeExactTokenRpc("register_native_media_asset", {
        p_bucket: "avatars",
        p_content_id: roomId,
        p_content_type: "group_cover",
        p_expires_at: null,
        p_object_path: path,
      }, accessToken);
      if (registerError) {
        const cleanupResult = await requestNativeStorageCleanupResult("avatars", path, "register_group_cover_media_failed", accessToken);
        throw createNativeProtectedActionError({
          ok: false,
          stage: "register",
          originalError: registerError,
          cleanupAttempted: true,
          cleanupResult,
        });
      }
      const avatarUrl = resolveNativeAvatarUrl(path);
      if (!avatarUrl) throw new Error("missing_public_url");
      const row = await updateNativeGroupChatMetadata({ roomId, avatarUrl, updateAvatar: true, accessToken });
      const savedAvatarUrl = row?.avatarUrl ?? avatarUrl;
      const previousCoverObjectName = extractNativeAvatarStorageObjectPath(room?.avatarUrl);
      if (previousCoverObjectName && previousCoverObjectName !== uploadedPath) {
        const cleanupResult = await requestNativeStorageCleanupResult("avatars", previousCoverObjectName, "replace_group_cover", accessToken);
        if (cleanupResult === "failed") {
          logNativeProtectedActionFailure("[native.chatDialogue] replace_group_cover_cleanup_failed", createNativeProtectedActionError({
            ok: false,
            stage: "cleanup",
            originalError: new Error("replace_group_cover_cleanup_failed"),
            cleanupAttempted: true,
            cleanupResult,
          }));
        }
      }
      setRoom((current) => current ? { ...current, avatarUrl: savedAvatarUrl } : current);
      void patchCachedNativeChatInboxGroupRows({ chatId: roomId, patch: { avatarUrl: savedAvatarUrl }, sessionKey: currentDialogueSessionKey, userId });
    } catch (error) {
      if (uploadedPath && !getNativeProtectedActionResult(error)) {
        const cleanupResult = await requestNativeStorageCleanupResult("avatars", uploadedPath, "group_cover_metadata_update_failed", accessToken);
        logNativeProtectedActionFailure("[native.chatDialogue] update_group_cover_failed", createNativeProtectedActionError({
          ok: false,
          stage: "domain_save",
          originalError: error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      } else {
        logNativeProtectedActionFailure("[native.chatDialogue] update_group_cover_failed", error);
      }
      setNotice("Couldn't update cover. Try again.");
    } finally {
      setGroupAvatarBusy(null);
    }
  }, [accessToken, currentDialogueSessionKey, groupAvatarBusy, isAdmin, room?.avatarUrl, roomId, userId]);

  const inviteGroupMember = useCallback(async (member: GroupManageMember) => {
    if (!roomId || !userId) return;
    if (!currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      const { error } = await nativeExactTokenRpc("invite_native_group_members", {
        p_chat_id: roomId,
        p_chat_name: title,
        p_invitee_user_ids: [member.id],
      }, accessToken);
      if (error) throw error;
      setGroupManageFriends((current) => current.filter((item) => item.id !== member.id));
    } catch {
      setNotice("Couldn't add member.");
    }
  }, [accessToken, currentUserVerified, roomId, title, userId]);

  const removeGroupMember = useCallback(async (member: GroupManageMember) => {
    if (!roomId) return;
    if (!currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      const { error } = await nativeExactTokenRpc("remove_group_member", {
        p_chat_id: roomId,
        p_user_id: member.id,
      }, accessToken);
      if (error) throw error;
      setGroupManageMembers((current) => current.filter((item) => item.id !== member.id));
      setMemberCount((current) => Math.max(0, current - 1));
    } catch {
      setNotice("Couldn't remove member.");
    }
  }, [accessToken, currentUserVerified, roomId]);

  const removeGroup = useCallback(async () => {
    if (!roomId) return;
    haptic.destructive();
    try {
      const { error } = await nativeExactTokenRpc("remove_group_chat", {
        p_chat_id: roomId,
      }, accessToken);
      if (error) throw error;
      onNavigate("/chats?tab=groups");
      if (userId) {
        void clearCachedNativeChatMessages(userId, roomId)
          .catch((cleanupError) => logNativeProtectedActionFailure("[native.chat] remove_group_cache_cleanup_failed", cleanupError));
      }
    } catch {
      setNotice("Unable to remove group right now.");
    } finally {
      setConfirmRemoveGroupOpen(false);
    }
  }, [accessToken, onNavigate, roomId, userId]);

  const leaveGroup = useCallback(async () => {
    if (!roomId || !userId) return;
    haptic.destructive();
    try {
      await sendNativeChatMessage({ roomId, senderId: userId, content: `${senderNames[userId] || "Someone"} left the group.`, accessToken, sessionKey: currentDialogueSessionKey });
      const { error } = await nativeExactTokenRpc("remove_native_group_member", {
        p_chat_id: roomId,
        p_user_id: userId,
      }, accessToken);
      if (error) throw error;
      onNavigate("/chats?tab=groups");
      void clearCachedNativeChatMessages(userId, roomId)
        .catch((cleanupError) => logNativeProtectedActionFailure("[native.chat] leave_group_cache_cleanup_failed", cleanupError));
    } catch {
      setNotice("Unable to leave group right now.");
    }
  }, [accessToken, currentDialogueSessionKey, onNavigate, roomId, senderNames, userId]);

  const refreshSharedGroupManagement = useCallback(async () => {
    if (!roomId) return;
    try {
      setGroupManagementLoading(true);
      setGroupManagement(await fetchNativeGroupManagementSnapshot(roomId, { accessToken }));
      setGroupManagementError(false);
    } catch {
      setGroupManagementError(true);
      setNotice("Couldn't load group members.");
    } finally {
      setGroupManagementLoading(false);
    }
  }, [accessToken, roomId]);

  const inviteSharedGroupMembers = useCallback(async (_group: NativeExploreGroup | NativeChatInboxRow, ids: string[]) => {
    if (!roomId || !userId || ids.length === 0) return;
    if (!currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      await inviteNativeGroupMembers({ chatId: roomId, chatName: title, inviterUserId: userId, inviteUserIds: ids, accessToken, sessionKey: currentDialogueSessionKey });
      await refreshSharedGroupManagement();
    } catch {
      setNotice("Couldn't send invite.");
    }
  }, [accessToken, currentDialogueSessionKey, currentUserVerified, refreshSharedGroupManagement, roomId, title, userId]);

  const cancelSharedGroupInvite = useCallback(async (_group: NativeExploreGroup | NativeChatInboxRow, invite: NativeGroupManagementSnapshot["pendingInvites"][number]) => {
    if (!roomId) return;
    try {
      await cancelNativeGroupInvite({ chatId: roomId, inviteId: invite.id, accessToken });
      await refreshSharedGroupManagement();
    } catch {
      setNotice("Couldn't cancel invite.");
    }
  }, [accessToken, refreshSharedGroupManagement, roomId]);

  const removeSharedGroupMember = useCallback(async (_group: NativeExploreGroup | NativeChatInboxRow, memberId: string) => {
    if (!roomId || !currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      await removeNativeGroupMember({ chatId: roomId, userId: memberId, actorUserId: userId, accessToken, sessionKey: currentDialogueSessionKey });
      await refreshSharedGroupManagement();
      setMemberCount((current) => Math.max(0, current - 1));
    } catch {
      setNotice("Couldn't remove member.");
    }
  }, [accessToken, currentDialogueSessionKey, currentUserVerified, refreshSharedGroupManagement, roomId, userId]);

  const updateSharedJoinRequest = useCallback(async (_group: NativeExploreGroup | NativeChatInboxRow, request: NativeGroupManagementSnapshot["joinRequests"][number], action: "approve" | "decline") => {
    if (!roomId || !userId) return;
    try {
      await updateNativeGroupJoinRequest({ chatId: roomId, requestId: request.id, userId: request.userId, actorUserId: userId, action, accessToken, sessionKey: currentDialogueSessionKey });
      await refreshSharedGroupManagement();
    } catch {
      setNotice("Couldn't update join request.");
      throw new Error("group_request_failed");
    }
  }, [accessToken, currentDialogueSessionKey, refreshSharedGroupManagement, roomId, userId]);

  const toggleSharedGroupMute = useCallback(async (_group: NativeExploreGroup | NativeChatInboxRow, muted: boolean) => {
    if (!roomId || !userId) return;
    try {
      await setNativeGroupMuteState({ chatId: roomId, muted, accessToken });
      setGroupMuted(muted);
      setGroupManagement((current) => current ? {
        ...current,
        members: current.members.map((member) => member.userId === userId ? { ...member, isMuted: muted } : member),
      } : current);
      setNotice(muted ? "Group muted." : "Notifications on.");
    } catch {
      setNotice("Unable to update notifications right now.");
    }
  }, [accessToken, roomId, userId]);

  const reportSharedGroupMember = useCallback((member: NativeGroupManagementSnapshot["members"][number]) => {
    setGroupMemberReportTarget({
      id: member.userId,
      name: member.name || "Member",
      avatarUrl: member.avatarUrl,
      socialId: null,
      isVerified: member.isVerified,
    });
    setReportOpen(true);
  }, []);

  const blockSharedGroupMember = useCallback((member: NativeGroupManagementSnapshot["members"][number]) => {
    setGroupMemberBlockTarget({
      id: member.userId,
      name: member.name || "Member",
      avatarUrl: member.avatarUrl,
      socialId: null,
      isVerified: member.isVerified,
    });
  }, []);

  // Reset manage sheet state on close.
  useEffect(() => {
    if (!groupManageOpen) {
      setGroupManageSearch("");
      setGroupManageReturnToInfo(false);
      setGroupDescriptionEditing(false);
    }
  }, [groupManageOpen]);

  // Sync description draft when sheet opens or background refresh updates description,
  // but only when the user is not actively editing (prevents draft clobber mid-edit).
  useEffect(() => {
    if (!groupManageOpen || groupDescriptionEditing) return;
    setGroupDescriptionDraft(room?.description || "");
  }, [groupManageOpen, groupDescriptionEditing, room?.description]);

	  useEffect(() => {
	    if (!groupInfoOpen) {
	      setGroupNameEditing(false);
	      setGroupNameSaving(false);
	      return;
	    }
	    if (!groupNameEditing) setGroupNameDraft(title);
    setGroupDescriptionDraft(room?.description || "");
    setGroupLocationDraft(room?.locationLabel || "");
    setGroupPetFocusDraft(room?.petFocus || []);
    setGroupDetailsErrors({});
	  }, [groupInfoOpen, groupNameEditing, room?.description, room?.locationLabel, room?.petFocus, title]);

  const renderLinkPreview = (url: string | null, removable = false) => {
    if (!url) return null;
    return (
      <View style={removable ? nativeModalStyles.appModalInlineCardWrap : undefined}>
        <NativeSocialExternalLinkPreview
          linkPreview={linkPreviews[url] || null}
          onOpen={(nextUrl) => { if (!navigateNativeHuddleLink(nextUrl, onNavigate)) void Linking.openURL(nextUrl); }}
          onRemove={removable ? () => {
            setInput((current) => stripUrl(current, url));
            setDismissedPreviewUrls((current) => new Set([...current, url]));
            setLockedPreviewUrl((current) => current === url ? null : current);
          } : undefined}
          url={url}
        />
      </View>
    );
  };

  const retryAttachmentLoad = useCallback(async (key: string, path: string | null | undefined) => {
    setFailedAttachmentKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (!path) return;
    setAttachmentUrls((current) => ({ ...current, [path]: null }));
    const urls = await resolveAttachmentUrls(messagesRef.current, accessToken);
    setAttachmentUrls((current) => ({ ...current, ...urls }));
  }, [accessToken]);

  const cancelEditMode = useCallback(() => {
    setEditingMessageId(null);
    setOpenMessageActionsId(null);
    setInput("");
    setLockedPreviewUrl(null);
    setUploads([]);
    setDismissedPreviewUrls(new Set());
    Keyboard.dismiss();
  }, []);

  const editOwnMessage = useCallback((message: NativeChatMessage) => {
    if (message.senderId !== userId || isPendingNativeChatMessage(message)) return;
    const parsed = parseMessageContent(message.content);
    const isDeleted = parsed.kind === "deleted";
    if (isDeleted) return;
    setInput(parsed.text);
    setLockedPreviewUrl(parsed.linkPreviewUrl);
    setUploads(parsed.attachments.map((attachment, index) => {
      const resolvedUri = attachment.url || (attachment.path ? attachmentUrlsRef.current[attachment.path] : null) || "";
      return {
        attachment: {
          bucket: NATIVE_CHAT_ATTACHMENTS_BUCKET as typeof NATIVE_CHAT_ATTACHMENTS_BUCKET,
          path: attachment.path || "",
          url: attachment.url,
          name: attachment.name || `attachment-${index + 1}`,
          mime: attachment.mime || "image/jpeg",
          size: null,
        },
        height: null,
        uri: resolvedUri,
        name: attachment.name || `attachment-${index + 1}`,
        mime: attachment.mime || "image/jpeg",
        progress: 100,
        size: null,
        status: "uploaded" as const,
        width: null,
      };
    }).filter((item) => Boolean(item.uri && item.attachment.path)));
    setEditingMessageId(message.id);
    setOpenMessageActionsId(null);
    const scrollToEditingMessage = () => {
      scrollMessageAboveComposer(message.id);
    };
    requestAnimationFrame(scrollToEditingMessage);
    setTimeout(scrollToEditingMessage, 260);
  }, [scrollMessageAboveComposer, userId]);

  const deleteOwnMessage = useCallback(async (message: NativeChatMessage) => {
    if (!userId || message.senderId !== userId || isPendingNativeChatMessage(message)) return;
    const requestRoomId = message.chatId || roomIdRef.current;
    const requestSessionKey = dialogueSessionKeyRef.current;
    if (!isCurrentDialogueRequest(requestRoomId, requestSessionKey)) return;
    try {
      const previousAttachments = parseMessageContent(message.content).attachments.filter((attachment) => Boolean(attachment.path));
      const deletedAt = new Date().toISOString();
      const content = JSON.stringify({ text: "Message deleted", attachments: [], kind: "deleted", deletedAt });
      const { data, error } = await nativeExactTokenRpc<unknown[]>("update_native_chat_message_content", {
        p_message_id: message.id,
        p_content: content,
      }, accessToken);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      const updated: NativeChatMessage = row && typeof row === "object" ? {
        id: String((row as Record<string, unknown>).id || message.id),
        chatId: String((row as Record<string, unknown>).chat_id || message.chatId),
        senderId: String((row as Record<string, unknown>).sender_id || message.senderId),
        content: String((row as Record<string, unknown>).content || content),
        createdAt: String((row as Record<string, unknown>).created_at || message.createdAt),
        updatedAt: deletedAt,
      } : { ...message, content, updatedAt: deletedAt };
      setOpenMessageActionsId(null);
      await hydrateMessages(messagesRef.current.map((item) => item.id === message.id ? updated : item), { requestRoomId, requestSessionKey, scrollToLatest: false });
      if (previousAttachments.length > 0) {
        void Promise.allSettled(previousAttachments.map((attachment) => deleteOwnNativeChatAttachment({
          accessToken,
          path: attachment.path || "",
          sessionKey: requestSessionKey,
          userId,
        }))).then((results) => {
          results.forEach((result) => {
            if (result.status === "rejected") logNativeProtectedActionFailure("[native.chat] delete_message_attachment_cleanup_failed", result.reason);
          });
        });
      }
    } catch (error) {
      logNativeProtectedActionFailure("[native.chat] delete_message_failed", error);
      setNotice("Unable to delete message right now.");
    }
  }, [accessToken, hydrateMessages, isCurrentDialogueRequest, userId]);

  const handleMessageTouchStart = (message: NativeChatMessage, x: number, y: number) => {
    if (message.senderId !== userId || isPendingNativeChatMessage(message)) return;
    messageTouchStartRef.current = { id: message.id, x, y };
  };

  const handleMessageTouchEnd = (message: NativeChatMessage, x: number, y: number) => {
    const start = messageTouchStartRef.current;
    messageTouchStartRef.current = null;
    if (!start || start.id !== message.id) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) setOpenMessageActionsId(message.id);
    if (dx > 0 && openMessageActionsId === message.id) setOpenMessageActionsId(null);
  };

  const openOwnMessageActions = useCallback((message: NativeChatMessage) => {
    if (message.senderId !== userId || isPendingNativeChatMessage(message)) return;
    haptic.swipeThreshold();
    setOpenMessageActionsId(message.id);
  }, [userId]);

  const editingMessage = useMemo(() => {
    if (!editingMessageId) return null;
    return messages.find((message) => message.id === editingMessageId && message.senderId === userId) ?? null;
  }, [editingMessageId, messages, userId]);

  const renderEditingFocusBubble = () => {
    if (!editingMessage) return null;
    const parsed = parseMessageContent(editingMessage.content);
    const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
    const displayText = previewUrl ? stripUrl(parsed.text, previewUrl) : parsed.text;
    const resolvedAttachments = parsed.attachments.map((attachment, attachmentIndex) => ({
      key: `${editingMessage.id}:edit:${attachment.path || attachment.url || attachmentIndex}`,
      mime: attachment.mime,
      path: attachment.path,
      uri: attachment.url || (attachment.path ? attachmentUrls[attachment.path] : null),
    }));
    const hasRichContent = parsed.attachments.length > 0 || Boolean(previewUrl);
    const hasImageOnlyContent = parsed.attachments.length > 0 && !previewUrl && !displayText;

    return (
      <View pointerEvents="none" style={[styles.editingFocusWrap, { bottom: Math.max(composerHeight, 76) + (keyboardVisible ? keyboardHeight + huddleSpacing.x4 : huddleSpacing.x2) }]}>
        <View style={[styles.messageBubble, hasRichContent && styles.messageBubbleRich, hasImageOnlyContent ? styles.messageBubbleMediaOnly : null, styles.messageBubbleMine, hasImageOnlyContent ? styles.messageBubbleMediaOnlyMine : null, styles.editingFocusBubble]}>
          {parsed.attachments.length > 0 ? (
            <NativeChatAttachmentCarousel failedAttachmentKeys={failedAttachmentKeys} messageId={editingMessage.id} onRetry={(key, path) => void retryAttachmentLoad(key, path)} resolvedAttachments={resolvedAttachments} />
          ) : null}
          {renderLinkPreview(previewUrl)}
          {displayText ? <Text style={[styles.messageText, hasRichContent && styles.messageTextRich, styles.messageTextMine]}>{displayText}</Text> : null}
        </View>
      </View>
    );
  };

  const renderMessage = (message: NativeChatMessage, index: number) => {
    const mine = message.senderId === userId;
    const parsed = parseMessageContent(message.content);
    const text = parsed.text.trim();
    const isMembershipHint = isGroup && parsed.kind !== "system" && parsed.attachments.length === 0 && text.length > 0 && (parsed.kind === "membership" || /just joined the chat\.$|has joined the group!$|left the group\.$/i.test(text));
    const membershipText = isMembershipHint ? normalizeMembershipHintText(text) : text;
    const isSystem = parsed.kind === "system";
    const isStarIntro = !isGroup && isStarIntroKind(parsed.kind);
    const isStarFirstUserMessage = !isGroup && firstStarUserMessageId === message.id;
    const failedActions = mine && message.localStatus === "failed" ? (
      <View accessibilityLabel="Failed message actions" style={styles.failedMessageActions}>
        <Pressable accessibilityRole="button" onPress={() => void retryFailedMessage(message)} style={styles.failedMessageActionButton}>
          <Text style={styles.failedMessageRetryText}>Retry</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => dismissFailedMessage(message)} style={styles.failedMessageActionButton}>
          <Text style={styles.failedMessageDismissText}>Dismiss</Text>
        </Pressable>
      </View>
    ) : null;
    const isTargetMessage = highlightedMessageId === message.id;
    const previous = index > 0 ? visibleMessages[index - 1] : null;
    const divider = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
      ? formatDividerLabel(message.createdAt)
      : "";
    if (isSystem) {
      return (
        <View key={message.id} style={isTargetMessage ? styles.targetMessageFrame : null}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          {isGroup && room?.roomCode && text.startsWith(`Room Code: ${room.roomCode}`) ? null : <Text style={styles.systemPill}>{text}</Text>}
        </View>
      );
    }
    if (isMembershipHint) {
      return (
        <View key={message.id} style={isTargetMessage ? styles.targetMessageFrame : null}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          <Text style={styles.membershipPill}>{membershipText}</Text>
        </View>
      );
    }
    const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
    const displayText = previewUrl ? stripUrl(parsed.text, previewUrl) : parsed.text;
    const hasRichContent = parsed.attachments.length > 0 || Boolean(previewUrl);
    const hasImageOnlyContent = parsed.attachments.length > 0 && !previewUrl && !displayText;
    const resolvedAttachments = parsed.attachments.map((attachment, attachmentIndex) => ({
      key: `${message.id}:${attachment.path || attachment.url || attachmentIndex}`,
      mime: attachment.mime,
      path: attachment.path,
      uri: attachment.url || (attachment.path ? attachmentUrls[attachment.path] : null),
    }));
    const isDeleted = parsed.kind === "deleted";
    if (parsed.share) {
      return (
        <View key={message.id} style={isTargetMessage ? styles.targetMessageFrame : null}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          {isGroup && !mine ? <Text style={styles.senderName}>{senderNames[message.senderId] || ""}</Text> : null}
          <View style={[styles.messageRow, mine && styles.messageRowMine]}>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                const path = parsed.share?.contentId && parsed.share.contentType
                  ? nativePathForSharedContent({
                      appUrl: parsed.share.appUrl,
                      contentId: parsed.share.contentId!,
                      contentType: parsed.share.contentType!,
                    })
                  : nativePathForHuddleWebPath(getShareTargetUrl(parsed.share));
                if (path) onNavigate(path);
              }}
              style={[styles.chatShareCard, mine ? styles.chatShareCardMine : styles.chatShareCardTheirs]}
            >
              <View style={styles.chatShareCardBody}>
                <View style={styles.shareThumb}>{parsed.share.imageUrl ? <Image key={nativeFreshImageKey(parsed.share.imageUrl, parsed.share.canonicalUrl || parsed.share.appUrl || parsed.share.imageUrl)} resizeMode="cover" source={{ uri: nativeFreshImageUri(parsed.share.imageUrl, parsed.share.canonicalUrl || parsed.share.appUrl || parsed.share.imageUrl) }} style={styles.shareThumbImage} /> : null}</View>
                <View style={styles.shareTextWrap}>
	                  <Text numberOfLines={1} style={[styles.shareSurface, styles.shareTextOnBubble]}>{parsed.share.surface || "huddle"}</Text>
	                  <Text numberOfLines={2} style={[styles.shareTitle, styles.shareTextOnBubble]}>{buildShareHeadline(parsed.share)}</Text>
	                  {parsed.share.description ? <Text numberOfLines={2} style={[styles.shareDescription, styles.shareDescriptionOnBubble]}>{parsed.share.description}</Text> : null}
                </View>
                <Feather color={huddleColors.iconMuted} name="chevron-right" size={16} />
              </View>
            </Pressable>
          </View>
          <View style={[styles.messageMeta, mine && styles.messageMetaMine]}>
            <Text style={styles.messageTime}>{message.localStatus === "pending" ? "Sending" : message.localStatus === "failed" ? "Failed" : formatMessageTime(message.createdAt)}</Text>
            {failedActions}
            {mine && !isPendingNativeChatMessage(message) ? <Text style={[styles.readMark, readMessageIds.has(message.id) && styles.readMarkSeen]}>{readMessageIds.has(message.id) ? "✓✓" : "✓"}</Text> : null}
          </View>
        </View>
      );
    }
    return (
      <View key={message.id} style={isTargetMessage ? styles.targetMessageFrame : null}>
        {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
        {isGroup && !mine ? <Text style={styles.senderName}>{senderNames[message.senderId] || ""}</Text> : null}
        <Pressable
          delayLongPress={260}
          onLayout={(event) => {
            messageYOffsetRef.current[message.id] = event.nativeEvent.layout.y;
            if (message.id === paramsRef.current.targetMessageId && !targetScrollDoneRef.current) {
              const targetRoomId = roomIdRef.current;
              const targetSessionKey = dialogueSessionKeyRef.current;
              if (targetRoomId) {
                requestAnimationFrame(() => {
                  if (!isCurrentDialogueRequest(targetRoomId, targetSessionKey)) return;
                  if (!scrollMessageAboveComposer(message.id)) return;
                  targetScrollDoneRef.current = true;
                  setHighlightedMessageId(message.id);
                  clearTargetHighlightLater(targetRoomId, targetSessionKey);
                });
              }
            }
          }}
          onLongPress={() => openOwnMessageActions(message)}
          onTouchEnd={(event) => handleMessageTouchEnd(message, event.nativeEvent.pageX, event.nativeEvent.pageY)}
          onTouchStart={(event) => handleMessageTouchStart(message, event.nativeEvent.pageX, event.nativeEvent.pageY)}
          style={[styles.messageSwipeFrame, mine && styles.messageSwipeFrameMine, mine && openMessageActionsId === message.id ? styles.messageSwipeFrameActionsOpen : null]}
        >
          {mine && openMessageActionsId === message.id ? (
            <View style={styles.messageActionStack}>
              <Pressable accessibilityLabel="Edit message" onPress={() => editOwnMessage(message)} style={styles.messageActionButton}>
                <Feather color={huddleColors.onPrimary} name="edit-2" size={15} />
              </Pressable>
              <Pressable accessibilityLabel="Delete message" onPress={() => void deleteOwnMessage(message)} style={[styles.messageActionButton, styles.messageDeleteButton]}>
                <Feather color={huddleColors.onPrimary} name="trash-2" size={15} />
              </Pressable>
            </View>
          ) : null}
        <View style={[styles.messageRow, mine && styles.messageRowMine, mine && openMessageActionsId === message.id ? styles.messageRowActionsOpen : null]}>
          <View style={[styles.messageBubble, hasRichContent && styles.messageBubbleRich, hasImageOnlyContent ? styles.messageBubbleMediaOnly : null, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs, isStarIntro || isStarFirstUserMessage ? styles.messageBubbleStar : null, !mine && !(isStarIntro || isStarFirstUserMessage) ? styles.messageBubbleCounterpart : null, hasImageOnlyContent ? (mine ? styles.messageBubbleMediaOnlyMine : styles.messageBubbleMediaOnlyTheirs) : null, isTargetMessage ? styles.messageBubbleTarget : null]}>
            {isStarIntro ? (
              <Text style={styles.starText}>{mine ? "You sent a Star ⭐" : "New Star Connection ⭐"}</Text>
            ) : null}
            {!isStarIntro && !isDeleted && parsed.attachments.length > 0 ? (
              <NativeChatAttachmentCarousel failedAttachmentKeys={failedAttachmentKeys} messageId={message.id} onLongPress={mine ? () => openOwnMessageActions(message) : undefined} onRetry={(key, path) => void retryAttachmentLoad(key, path)} resolvedAttachments={resolvedAttachments} />
            ) : null}
            {!isStarIntro && !isDeleted ? renderLinkPreview(previewUrl) : null}
            {isDeleted ? <Text style={[styles.messageText, styles.messageDeletedText]}>Message deleted</Text> : null}
            {!isStarIntro && !isDeleted && displayText ? <Text style={[styles.messageText, hasRichContent && styles.messageTextRich, mine && styles.messageTextMine, isStarFirstUserMessage ? styles.starText : null]}>{displayText}</Text> : null}
          </View>
        </View>
        </Pressable>
        <View style={[styles.messageMeta, mine && styles.messageMetaMine, mine && openMessageActionsId === message.id ? styles.messageMetaActionsOpen : null]}>
          <Text style={styles.messageTime}>{message.localStatus === "pending" ? "Sending" : message.localStatus === "failed" ? "Failed" : formatMessageTime(message.createdAt)}</Text>
          {failedActions}
          {mine && !isPendingNativeChatMessage(message) ? <Text style={[styles.readMark, readMessageIds.has(message.id) && styles.readMarkSeen]}>{readMessageIds.has(message.id) ? "✓✓" : "✓"}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      accessibilityState={{ busy: refreshing }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      style={[styles.screen, { paddingTop: insets.top + huddleSpacing.x2 }]}
    >
      <View onLayout={(e) => setChatHeaderHeight(e.nativeEvent.layout.height)} style={styles.header}>
        <Pressable accessibilityLabel="Back" hitSlop={huddleSpacing.x2} onPress={onGoBack} style={styles.iconButton}><Feather color={huddleColors.text} name="arrow-left" size={20} /></Pressable>
        {!headerReady ? (
          params.name ? (
            // Optimistic header from route hints (name + avatar) so the bar shows
            // instantly instead of a skeleton while the snapshot loads.
            <View style={styles.identity} pointerEvents="none">
              <View style={styles.avatar}>
                <ResilientAvatarImage
                  fallback={<Image accessibilityLabel={params.name} resizeMode="cover" source={profilePlaceholder} style={styles.avatarImage} />}
                  resizeMode="cover"
                  style={styles.avatarImage}
                  uri={routeAvatarHint}
                  version={routeAvatarHint}
                />
              </View>
              <View style={styles.identityText}>
                <Text numberOfLines={1} style={styles.title}>{params.name}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.identity} pointerEvents="none">
              <View style={[styles.avatar, styles.headerSkeletonAvatar]} />
              <View style={styles.identityText}>
                <View style={styles.headerSkeletonTitle} />
                <View style={styles.headerSkeletonSubtitle} />
              </View>
            </View>
          )
        ) : isGroup ? (
          <Pressable accessibilityLabel="Open group details" onPress={openGroupInfoSheet} style={styles.identity}>
            <View style={styles.avatar}><ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={20} />} style={styles.avatarImage} uri={room?.avatarUrl} version={room?.updatedAt} /></View>
            <View style={styles.identityText}><Text numberOfLines={1} style={styles.title}>{title}</Text><Text numberOfLines={1} style={styles.subtitle}>{memberCountLabel}</Text></View>
          </Pressable>
        ) : isService ? (
          <View style={styles.identity}>
            <View style={styles.avatar}><Feather color={huddleColors.blue} name="heart" size={20} /></View>
            <View style={styles.identityText}><Text numberOfLines={1} style={styles.title}>{title}</Text><Text numberOfLines={1} style={styles.subtitle}>Care chat</Text></View>
          </View>
        ) : (
          <Pressable disabled={counterpart?.isTeamHuddle === true} onPress={() => {
            if (!counterpart?.id) return;
            setProfileSheetFallbackData(profileSummaryToProfileFallback(counterpart));
            setProfileSheetUserId(counterpart.id);
          }} style={styles.identity}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, counterpart?.isTeamHuddle ? styles.teamHuddleAvatar : null, counterpart?.isVerified ? styles.avatarVerified : null]}>
                <ResilientAvatarImage
                  fallback={<Image accessibilityLabel={title} resizeMode={counterpart?.isTeamHuddle ? "contain" : "cover"} source={counterpart?.isTeamHuddle ? teamHuddleLogo : profilePlaceholder} style={styles.avatarImage} />}
                  resizeMode={counterpart?.isTeamHuddle ? "contain" : "cover"}
                  style={styles.avatarImage}
                  uri={counterpart?.isTeamHuddle ? null : counterpart?.avatarUrl}
                />
              </View>
              <VerifiedAvatarBadge active={counterpart?.isVerified === true} />
            </View>
            <View style={styles.identityText}>
              <View style={styles.titleRow}><Text numberOfLines={1} style={styles.title}>{title}</Text>{counterpart?.socialId && !counterpart?.isTeamHuddle ? <Text numberOfLines={1} style={styles.subtitle}>@{counterpart.socialId}</Text> : null}</View>
              <Text numberOfLines={1} style={styles.subtitle}>{counterpart?.availability || "Animal Friend"}</Text>
            </View>
          </Pressable>
        )}
        {headerReady && !isService && (!counterpart?.isTeamHuddle || isGroup) ? <Pressable accessibilityLabel={isGroup ? "Group details" : "More conversation options"} hitSlop={huddleSpacing.x2} testID={isGroup ? "native-chat-group-details-button" : "native-chat-more-button"} onPress={() => setMenuOpen(true)} style={styles.iconButton}><Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} /></Pressable> : <View style={styles.iconButton} />}
      </View>
      {notice ? <NativeToast icon="info" message={notice} /> : null}
      {isGroup && room?.visibility === "private" && room.roomCode ? (
        <View style={styles.roomCodeWrap}>
          <Text style={styles.roomCode}>Room Code: {room.roomCode}</Text>
        </View>
      ) : null}
      {isGroup && groupEvents.length > 0 ? (
        <View style={styles.groupEventPinnedStack}>
          {groupEvents.map((event) => (
            <GroupEventCard
              busy={groupEventBusyId === event.id}
              canExpand={groupEvents.length === 1}
              event={event}
              expanded={groupEvents.length === 1 && expandedGroupEventIds.has(event.id)}
              isCreator={event.creatorId === userId || isAdmin}
              key={event.id}
              onEdit={() => {
                if (event.seriesId) {
                  setSeriesEventAction({ event, mode: "edit" });
                } else {
                  setEditingGroupEvent(event);
                  setGroupEventSheetOpen(true);
                }
              }}
              onRemove={() => {
                if (event.seriesId) setSeriesEventAction({ event, mode: "cancel" });
                else setConfirmRemoveEvent(event);
              }}
              onToggleExpanded={() => {
                if (groupEvents.length > 1) return;
                setExpandedGroupEventIds((current) => {
                  const next = new Set(current);
                  if (next.has(event.id)) next.delete(event.id);
                  else next.add(event.id);
                  return next;
                });
              }}
              onToggleRsvp={() => { void toggleEventRsvp(event.id); }}
            />
          ))}
        </View>
      ) : null}
      {loadError && messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Conversation unavailable</Text>
          <Text style={styles.emptyBody}>We couldn't load this conversation. Check your connection and try again.</Text>
          <Pressable accessibilityLabel="Retry conversation" onPress={() => setLoadRetryKey((value) => value + 1)} style={styles.emptyAction}>
            <Text style={styles.emptyActionText}>Try again</Text>
          </Pressable>
        </View>
      ) : loading && !roomId && !params.name && messages.length === 0 ? <NativeLoadingState style={styles.messagesLoading} /> : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.messages, keyboardVisible ? styles.messagesKeyboard : null]}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={(_, contentHeight) => {
            const viewportHeight = scrollViewportHeightRef.current || 0;
            if (nearBottomRef.current && contentHeight > viewportHeight + huddleSpacing.x2) {
              scrollRef.current?.scrollToEnd({ animated: false });
              markCurrentRoomSeen();
            }
          }}
          onLayout={(event) => {
            scrollViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onTouchStart={() => {
            if (groupEventMenuOpen) setGroupEventMenuOpen(false);
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const distanceToBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
            const nearBottom = distanceToBottom <= 120;
            nearBottomRef.current = nearBottom;
            setShowLatest(!nearBottom);
            if (nearBottom) markCurrentRoomSeen();
            if (contentOffset.y < 56) void loadOlder();
          }}
          scrollEventThrottle={80}
          style={styles.messagesScroll}
        >
          {loadingOlder ? <NativeLoadingState variant="inline" /> : null}
          {loading && roomId && messages.length === 0 ? <NativeLoadingState variant="inline" /> : null}
          {blockState === "blocked_by_me" ? <Text style={styles.systemPill}>You've blocked {counterpart?.displayName || "this user"}</Text> : null}
          {blockState === "blocked_by_them" ? <Text style={styles.systemPill}>You're blocked by {counterpart?.displayName || "user"}.</Text> : null}
          {unmatchState !== "none" ? <Text style={styles.systemPill}>{unmatchState === "unmatched_by_me" ? "You've unmatched this user." : "You've been unmatched."}</Text> : null}
          {visibleMessages.map(renderMessage)}
          {showLatest ? (
            <Pressable onPress={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
              nearBottomRef.current = true;
              setShowLatest(false);
              markCurrentRoomSeen();
            }} style={styles.latestButton}>
              <Feather color={huddleColors.text} name="arrow-down" size={14} />
              <Text style={styles.latestText}>Latest</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
      {editingMessageId ? (
        <Pressable
          accessibilityLabel="Exit edit mode"
          onPress={cancelEditMode}
          onTouchEnd={(event) => {
            const startY = editScrimTouchStartYRef.current;
            editScrimTouchStartYRef.current = null;
            if (startY == null) return;
            const dy = event.nativeEvent.pageY - startY;
            if (dy > 42) cancelEditMode();
          }}
          onTouchStart={(event) => {
            editScrimTouchStartYRef.current = event.nativeEvent.pageY;
          }}
          style={styles.editModeScrim}
        >
          <RNBlurView blurAmount={8} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
        </Pressable>
      ) : null}
      {renderEditingFocusBubble()}
      <View
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          composerHeightRef.current = height;
          setComposerHeight(height);
        }}
        style={[
          nativeModalStyles.appModalComposerSurface,
          styles.dialogueComposerSurface,
          { paddingBottom: keyboardVisible ? huddleSpacing.x1 : Math.max(insets.bottom, huddleSpacing.x4) },
        ]}
      >
	        {groupEventMenuOpen && isGroup ? (
	          <View style={styles.groupComposerMenuInline}>
	            <AppActionMenu items={[
	              { label: "Photo", icon: "image", onPress: () => { setGroupEventMenuOpen(false); void pickMedia(); } },
	              { label: "Event", icon: "calendar", onPress: openCreateEventSheet },
	            ]} />
	          </View>
	        ) : null}
	        {activePreviewUrl ? renderLinkPreview(activePreviewUrl, true) : null}
        {uploads.length > 0 ? (
          <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uploadRail}>
            {uploads.map((item, index) => (
              <View key={`${item.uri}:${index}`} style={styles.uploadThumb}>
                {item.mime.startsWith("image/") ? <Image key={nativeFreshImageKey(item.uri, item.uri)} resizeMode="cover" source={{ uri: nativeFreshImageUri(item.uri, item.uri) }} style={styles.uploadImage} /> : <View style={styles.uploadVideoThumb}><Feather color={huddleColors.onPrimary} name="play" size={22} /></View>}
                {item.status === "uploading" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <NativeSpinner tone="primary" />
                    <Text style={styles.uploadingText}>{uploadProgress ?? 0}%</Text>
                  </View>
                ) : null}
                {item.status === "error" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <Feather color={huddleColors.onPrimary} name="alert-triangle" size={16} />
                    <Text style={styles.uploadingText}>Upload failed</Text>
                  </View>
                ) : null}
                <Pressable onPress={() => setUploads((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={styles.removeUpload}><Feather color={huddleColors.onPrimary} name="x" size={12} /></Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {chatDisabledBySafety ? (
          <View style={styles.safetyLock}><Feather color={huddleColors.emergency} name="lock" size={15} /><Text style={styles.safetyText}>Your messaging access is currently restricted due to recent account activity that does not meet our community safety standards.</Text></View>
        ) : (
          <View style={styles.composerRow}>
            <View style={[nativeModalStyles.appModalComposerTray, composerFocused ? nativeModalStyles.appModalComposerTrayFocused : null]}>
              {editingMessageId ? (
                <Pressable accessibilityLabel="Exit edit mode" onPress={cancelEditMode} style={styles.attachButton}><Feather color={huddleColors.mutedText} name="x" size={17} /></Pressable>
              ) : (
                <Pressable
                  accessibilityLabel={isGroup ? "Open group actions" : canSendVideo ? "Add media" : "Add images"}
                  disabled={composerDisabled}
	                  onPress={isGroup ? () => setGroupEventMenuOpen((current) => !current) : pickMedia}
                  style={styles.attachButton}
                >
                  <Feather color={huddleColors.mutedText} name={isGroup ? "plus" : "image"} size={17} />
                </Pressable>
              )}
              <AppModalField accessibilityLabel={editingMessageId ? "Edit message" : "Message"} testID="native-chat-composer-input" autoFocus={Boolean(editingMessageId)} editable={!composerDisabled} focused={composerFocused} key={editingMessageId ? `editing-${editingMessageId}` : "composer"} multiline onBlur={() => setComposerFocused(false)} onChangeText={setInput} onFocus={() => setComposerFocused(true)} placeholder={editingMessageId ? "Edit message" : ""} style={nativeModalStyles.appModalComposerInput} value={input} />
            </View>
              <Pressable accessibilityLabel={editingMessageId ? "Save message" : "Send message"} testID="native-chat-send-button" disabled={composerDisabled || uploadBlockingSend || (!input.trim() && uploads.length === 0 && !activePreviewUrl)} onPress={() => submitMessage()} style={[styles.sendButton, (composerDisabled || uploadBlockingSend || (!input.trim() && uploads.length === 0 && !activePreviewUrl)) && huddleButtons.disabled]}>
              {sending ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.onPrimary} name="send" size={17} />}
            </Pressable>
          </View>
        )}
      </View>
      <Modal presentationStyle="overFullScreen" transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setMenuOpen(false)}>
          <AppActionMenu items={isGroup ? [
            { label: "Group info", icon: "info", onPress: () => transitionNativeModal(() => setMenuOpen(false), openGroupInfoSheet) },
            { label: "Event", icon: "calendar", onPress: () => transitionNativeModal(() => setMenuOpen(false), openCreateEventSheet) },
            { label: groupMuted ? "Notifications on" : "Mute group", icon: groupMuted ? "bell-off" : "bell", onPress: () => { setMenuOpen(false); void toggleMute(); } },
            { label: "Report group", icon: "flag", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setReportOpen(true)) },
            { label: isAdmin ? "Remove group" : "Leave group", icon: "log-out", destructive: true, onPress: () => transitionNativeModal(() => setMenuOpen(false), () => { if (isAdmin) setConfirmRemoveGroupOpen(true); else setConfirmLeaveOpen(true); }) },
          ] : [
            { label: "Report User", icon: "flag", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setReportOpen(true)) },
            { label: blockState === "blocked_by_me" ? "Unblock User" : "Block User", icon: "slash", destructive: blockState !== "blocked_by_me", onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setConfirmBlockOpen(true)) },
            { label: "Unmatch", icon: "user-x", destructive: true, onPress: () => transitionNativeModal(() => setMenuOpen(false), () => setConfirmUnmatchOpen(true)) },
          ]} />
        </Pressable>
      </Modal>
	      <GroupEventSeriesActionSheet
        action={seriesEventAction}
        onClose={() => setSeriesEventAction(null)}
        onEditSeries={(event) => {
          transitionNativeModal(
            () => setSeriesEventAction(null),
            () => {
              setEditingGroupEvent(event);
              setGroupEventSheetOpen(true);
            },
          );
        }}
        onRequestCancellation={(event, scope) => {
          transitionNativeModal(
            () => setSeriesEventAction(null),
            () => setConfirmSeriesCancellation({ event, scope }),
          );
        }}
      />
	      <GroupEventSheet
        defaultTimeZone={inferGroupEventTimeZone(room, groupEventUserLocationTimeZone)}
        event={editingGroupEvent}
        open={groupEventSheetOpen}
        saving={Boolean(groupEventBusyId)}
        userLocationTimeZone={groupEventUserLocationTimeZone}
        onClose={() => {
          setGroupEventSheetOpen(false);
          setEditingGroupEvent(null);
        }}
        onSave={async (input) => {
          if (!roomId) return;
          setGroupEventBusyId(editingGroupEvent?.id || "new");
          try {
            if (editingGroupEvent?.seriesId) {
              await updateNativeGroupEventSeries({ ...input, eventId: editingGroupEvent.id }, { accessToken });
            } else if (editingGroupEvent) {
              await updateNativeGroupChatEvent({ ...input, eventId: editingGroupEvent.id }, { accessToken });
            } else if (input.recurrenceRule) {
              await createNativeRecurringGroupChatEvent({ ...input, chatId: roomId }, { accessToken });
            } else {
              await createNativeGroupChatEvent({ ...input, chatId: roomId }, { accessToken });
            }
            setGroupEventSheetOpen(false);
            setEditingGroupEvent(null);
            await refreshGroupEvents(roomId);
            haptic.success();
          } catch (error) {
            haptic.error();
            throw error;
          } finally {
            setGroupEventBusyId(null);
          }
        }}
      />
      {groupInfoOpen ? (
        <GroupDetailsModal
          countryLabel={room?.locationCountry || null}
          countdownNow={groupInfoCountdownNow}
          currentUserId={userId}
          descriptionEdit={groupDescriptionDraft}
          detailsErrors={groupDetailsErrors}
          editCover={null}
          group={sharedGroupDetailsRow}
          locationEdit={groupLocationDraft}
          management={groupManagement}
          managementError={groupManagementError}
          managementLoading={groupManagementLoading}
          muted={groupMuted}
          nameEdit={groupNameDraft}
          onBlockMember={blockSharedGroupMember}
          onCancelInvite={cancelSharedGroupInvite}
          onChangeDescriptionEdit={setGroupDescriptionDraft}
          onChangeLocationEdit={setGroupLocationDraft}
          onChangeNameEdit={setGroupNameDraft}
          onChangePetFocusEdit={setGroupPetFocusDraft}
          onClose={() => setGroupInfoOpen(false)}
          onDeclineInvite={async () => undefined}
          onInviteMembers={inviteSharedGroupMembers}
          onJoin={async () => undefined}
          onLeaveGroup={async () => { await leaveGroup(); }}
          onOpenChat={() => setGroupInfoOpen(false)}
          onOpenMemberProfile={(nextUserId) => {
            const fallback = groupMemberToProfileFallback(groupManageMembers.find((member) => member.id === nextUserId));
            transitionNativeModal(
              () => setGroupInfoOpen(false),
              () => {
                setProfileSheetFallbackData(fallback);
                setProfileSheetUserId(nextUserId);
              },
            );
          }}
          onPickCover={() => void updateGroupAvatar()}
          coverCropAsset={groupCoverCropAsset}
          onCancelCoverCrop={() => setGroupCoverCropAsset(null)}
          onSaveCoverCrop={uploadCroppedGroupCover}
          onRemoveGroup={async () => { await removeGroup(); }}
          onRemoveMember={removeSharedGroupMember}
          onReportMember={(member) => {
            transitionNativeModal(
              () => setGroupInfoOpen(false),
              () => reportSharedGroupMember(member),
            );
          }}
          onRequestAction={updateSharedJoinRequest}
          onSaveDetails={() => { void saveSharedGroupDetails(); }}
          onToggleMute={toggleSharedGroupMute}
          hideOpenChatButton
          petFocusEdit={groupPetFocusDraft}
          selectableMembers={groupManageFriends}
        />
      ) : null}
      <ConfirmModal open={confirmBlockOpen} title={blockState === "blocked_by_me" ? `Unblock ${counterpart?.displayName ?? "this user"}?` : `Block ${counterpart?.displayName ?? "this user"}?`} body={blockState === "blocked_by_me" ? "Allow this user to send you messages again?" : "You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats."} confirm={blockState === "blocked_by_me" ? "Unblock" : "Block"} destructive={blockState !== "blocked_by_me"} onCancel={() => setConfirmBlockOpen(false)} onConfirm={toggleBlock} />
      <ConfirmModal open={Boolean(groupMemberBlockTarget)} title={`Block ${groupMemberBlockTarget?.name ?? "this member"}?`} body="You will no longer see their posts or alerts, and they won't be able to interact with you directly in Chats." confirm="Block" destructive onCancel={() => setGroupMemberBlockTarget(null)} onConfirm={blockGroupMember} />
      <ConfirmModal open={confirmUnmatchOpen} title="Unmatch user" body="This conversation will be deleted permanently." confirm="Unmatch" destructive onCancel={() => setConfirmUnmatchOpen(false)} onConfirm={unmatch} />
      <ConfirmModal open={confirmLeaveOpen} title="Leave group?" body="You'll no longer see new messages in this group." confirm="Leave" destructive onCancel={() => setConfirmLeaveOpen(false)} onConfirm={leaveGroup} />
      <ConfirmModal open={confirmRemoveGroupOpen} title="Remove group?" body="This group and all its content will be permanently deleted. This action cannot be undone." confirm="Remove" destructive onCancel={() => setConfirmRemoveGroupOpen(false)} onConfirm={removeGroup} />
      <ConfirmModal open={Boolean(confirmRemoveEvent)} title="Remove event?" body="This event and its RSVP list will be removed from the group chat." confirm="Remove" destructive onCancel={() => setConfirmRemoveEvent(null)} onConfirm={removeGroupEvent} />
      <ConfirmModal
        open={Boolean(confirmSeriesCancellation)}
        title={confirmSeriesCancellation?.scope === "series" ? "Cancel entire series?" : "Cancel this event?"}
        body={confirmSeriesCancellation?.scope === "series"
          ? "This event and every remaining event in the series will be cancelled."
          : "This occurrence will be skipped and the next event in the series will become visible."}
        confirm="Cancel"
        destructive
        onCancel={() => setConfirmSeriesCancellation(null)}
        onConfirm={cancelRecurringGroupEvent}
      />
      <ConfirmModal open={groupVerifyGateOpen} title="Identity verification required" body="Complete identity verification to add or remove group members." cancel="Not now" confirm="Verify now" onCancel={() => setGroupVerifyGateOpen(false)} onConfirm={() => { setGroupVerifyGateOpen(false); onNavigate("/verify-identity"); }} />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        viewerUserId={userId}
        fallbackData={profileSheetFallbackData}
        sessionKey={sessionKey}
        onClose={() => {
          setProfileSheetUserId(null);
          setProfileSheetFallbackData(null);
        }}
        onNavigate={onNavigate}
        open={Boolean(profileSheetUserId)}
        hideMatchedActions
        profileUserId={profileSheetUserId}
      />
      <NativeSocialReportModal
        accessToken={accessToken}
        currentUserId={userId}
        chatRoomId={room?.id ?? null}
        onClose={() => { setReportOpen(false); setGroupMemberReportTarget(null); }}
        onNotice={setNotice}
        open={reportOpen}
        sessionKey={currentDialogueSessionKey}
        source={isGroup ? "Group Chat" : "Chat"}
        sourceOrigin="friends chats"
        subject={room?.id ? { type: isGroup ? "group_chat" : "direct_chat", id: room.id, label: isGroup ? (room?.name || "Group Chat") : "Chat" } : null}
        target={groupMemberReportTarget ? { userId: groupMemberReportTarget.id, author: { displayName: groupMemberReportTarget.name, socialId: groupMemberReportTarget.socialId, avatarUrl: groupMemberReportTarget.avatarUrl, verificationStatus: groupMemberReportTarget.isVerified ? "verified" : null, locationCountry: null, isVerified: groupMemberReportTarget.isVerified, nonSocial: false } } : counterpart ? { userId: counterpart.id, author: { displayName: counterpart.displayName, socialId: counterpart.socialId, avatarUrl: counterpart.avatarUrl, verificationStatus: counterpart.isVerified ? "verified" : null, locationCountry: null, isVerified: counterpart.isVerified, nonSocial: false } } : isGroup && groupOwner ? { userId: groupOwner.id, author: { displayName: groupOwner.displayName, socialId: groupOwner.socialId, avatarUrl: groupOwner.avatarUrl, verificationStatus: groupOwner.isVerified ? "verified" : null, locationCountry: null, isVerified: groupOwner.isVerified, nonSocial: false } } : null}
      />
    </KeyboardAvoidingView>
  );
}

function NativeChatAttachmentCarousel({
  failedAttachmentKeys,
  messageId,
  onLongPress,
  onRetry,
  resolvedAttachments,
}: {
  failedAttachmentKeys: Set<string>;
  messageId: string;
  onLongPress?: () => void;
  onRetry: (key: string, path: string | null | undefined) => void;
  resolvedAttachments: Array<{ key: string; mime: string; path: string | null; uri: string | null }>;
}) {
  const imageAttachments = resolvedAttachments.filter((attachment) => attachment.mime.startsWith("image/"));
  const mediaItems: NativeSocialCarouselItem[] = imageAttachments
    .filter((attachment) => Boolean(attachment.uri) && !failedAttachmentKeys.has(attachment.key))
    .map((attachment) => ({
      kind: "image",
      uri: String(attachment.uri),
    }));
  const firstFailed = imageAttachments.find((attachment) => failedAttachmentKeys.has(attachment.key) || !attachment.uri);

  if (mediaItems.length === 0 && firstFailed) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onRetry(firstFailed.key, firstFailed.path)}
        style={styles.attachmentFallbackFrame}
      >
        <Feather color={huddleColors.blue} name="refresh-cw" size={22} />
        <Text style={styles.attachmentFallbackText}>Tap to retry</Text>
      </Pressable>
    );
  }

  if (mediaItems.length === 0) return null;

  return (
    <View style={styles.chatAttachmentCarousel}>
      <NativeSocialMediaCarousel contentWidth={260} fixedFrameHeight={210} items={mediaItems} maxFrameHeight={210} minFrameWidth={160} onLongPress={onLongPress} thumbnailFit="cover" />
    </View>
  );
}

function GroupEventCard({
  busy,
  canExpand,
  event,
  expanded,
  isCreator,
  onEdit,
  onRemove,
  onToggleExpanded,
  onToggleRsvp,
}: {
  busy: boolean;
  canExpand: boolean;
  event: NativeGroupChatEvent;
  expanded: boolean;
  isCreator: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onToggleExpanded: () => void;
  onToggleRsvp: () => void;
}) {
  const avatarOverflow = Math.max(0, event.rsvpCount - event.rsvpAvatars.length);
  const rsvpSummary = event.rsvpCount === 1 ? "is going" : `${event.rsvpCount} are going`;
  const showRsvpSummary = event.rsvpCount > 0;
  const collapsedDate = formatEventCardDateTimeWithIcon(event.startsAt, event.endsAt);
  return (
    <View style={styles.groupEventCard}>
      <LinearGradient colors={[huddleColors.glassOverlay, huddleColors.canvas]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.groupEventPhaseStrip} />
      <Pressable
        accessibilityLabel={expanded ? "Collapse event" : "Expand event"}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        disabled={!canExpand}
        hitSlop={huddleSpacing.x1}
        onPress={onToggleExpanded}
        style={({ pressed }) => [styles.groupEventBody, pressed && canExpand ? nativeModalStyles.pressed : null]}
      >
        <View style={styles.groupEventHeader}>
          <View style={styles.groupEventTitleWrap}>
            <Text numberOfLines={1} style={styles.groupEventTitle}>{event.title}</Text>
          </View>
          <View style={styles.groupEventActions}>
            {isCreator ? (
              <>
                <Pressable accessibilityLabel="Edit event" hitSlop={huddleSpacing.x2} onPress={(pressEvent) => { pressEvent.stopPropagation(); onEdit(); }} style={({ pressed }) => [styles.groupEventIconButton, pressed ? nativeModalStyles.pressed : null]}>
                  <Feather color={huddleColors.blue} name="edit-2" size={18} />
                </Pressable>
                <Pressable accessibilityLabel="Remove event" hitSlop={huddleSpacing.x2} onPress={(pressEvent) => { pressEvent.stopPropagation(); onRemove(); }} style={({ pressed }) => [styles.groupEventIconButton, pressed ? nativeModalStyles.pressed : null]}>
                  <Feather color={huddleColors.validationRed} name="rotate-ccw" size={18} />
                </Pressable>
              </>
            ) : null}
            {!isCreator ? (
              <Pressable
                accessibilityLabel={event.viewerJoined ? "Leave event" : "Join event"}
                accessibilityRole="button"
                accessibilityState={{ checked: event.viewerJoined, busy }}
                disabled={busy}
                hitSlop={huddleSpacing.x2}
                onPress={(pressEvent) => { pressEvent.stopPropagation(); onToggleRsvp(); }}
                style={({ pressed }) => [styles.groupEventRsvpIconButton, pressed ? nativeModalStyles.pressed : null, busy ? styles.groupEventJoinButtonBusy : null]}
              >
                <NativeGlassCircle
                  blurAmount={12}
                  fallbackTint={event.viewerJoined ? "rgba(178,255,0,0.70)" : "rgba(255,255,255,0.22)"}
                  glassOpacity={event.viewerJoined ? 0.9 : 0.78}
                  highlightOpacity={0.4}
                  materialTint={event.viewerJoined ? "rgba(178,255,0,0.62)" : "rgba(255,255,255,0.12)"}
                  rimColor={event.viewerJoined ? "rgba(255,255,255,0.68)" : "rgba(66,73,101,0.18)"}
                  size={32}
                  tint={event.viewerJoined ? "rgba(178,255,0,0.62)" : "rgba(255,255,255,0.12)"}
                >
                  <Feather color={huddleColors.iconMuted} name="check" size={17} />
                </NativeGlassCircle>
              </Pressable>
            ) : null}
            {canExpand ? <Feather color={huddleColors.iconMuted} name={expanded ? "chevron-up" : "chevron-down"} size={18} /> : null}
          </View>
        </View>
        {expanded ? (
          <>
            <Text numberOfLines={2} style={styles.groupEventDescription}>{event.description}</Text>
            <Text numberOfLines={1} style={styles.groupEventMeta}>{formatEventCardDateTimeWithIcon(event.startsAt, event.endsAt)}</Text>
            <Text numberOfLines={1} style={styles.groupEventMeta}>📍 {event.locationLabel}</Text>
            <View style={styles.groupEventRsvpRow}>
              <View style={styles.groupEventAvatarStack}>
                {event.rsvpAvatars.map((avatar, index) => (
                  <View key={avatar.userId} style={[styles.groupEventAvatar, index > 0 ? styles.groupEventAvatarOverlap : null]}>
                    {avatar.avatarUrl ? <Image source={{ uri: avatar.avatarUrl }} style={styles.groupEventAvatarImage} /> : <Text style={styles.groupEventAvatarText}>{initials(avatar.displayName || "H")}</Text>}
                  </View>
                ))}
                {avatarOverflow > 0 ? <Text style={styles.groupEventOverflow}>+{avatarOverflow}</Text> : null}
              </View>
              {showRsvpSummary ? <Text style={styles.groupEventGoingText}>{rsvpSummary}</Text> : null}
            </View>
            {event.allowGuests ? <Text numberOfLines={1} style={styles.groupEventSubtext}>Extra guests allowed</Text> : null}
          </>
        ) : (
          <Text numberOfLines={1} style={styles.groupEventMeta}>{collapsedDate}</Text>
        )}
      </Pressable>
    </View>
  );
}

function GroupEventSeriesActionSheet({
  action,
  onClose,
  onEditSeries,
  onRequestCancellation,
}: {
  action: { event: NativeGroupChatEvent; mode: "edit" | "cancel" } | null;
  onClose: () => void;
  onEditSeries: (event: NativeGroupChatEvent) => void;
  onRequestCancellation: (event: NativeGroupChatEvent, scope: "occurrence" | "series") => void;
}) {
  if (!action) return null;
  const items = action.mode === "edit"
    ? [{ label: "Edit series", icon: "edit-2" as const, onPress: () => onEditSeries(action.event) }]
    : [
      { label: "Cancel this event", icon: "calendar" as const, destructive: true, onPress: () => onRequestCancellation(action.event, "occurrence") },
      { label: "Cancel entire series", icon: "x-circle" as const, destructive: true, onPress: () => onRequestCancellation(action.event, "series") },
    ];
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close event actions" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="content" onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>{action.mode === "edit" ? "Edit event" : "Cancel event"}</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll contentContainerStyle={styles.groupEventSheetContent}>
            <AppActionMenu items={items} />
          </AppBottomSheetScroll>
        </AppBottomSheet>
      </View>
    </Modal>
  );
}

function GroupEventSheet({
  defaultTimeZone,
  event,
  onClose,
  onSave,
  open,
  saving,
  userLocationTimeZone,
}: {
  defaultTimeZone: string;
  event: NativeGroupChatEvent | null;
  open: boolean;
  saving: boolean;
  userLocationTimeZone: string;
  onClose: () => void;
  onSave: (input: {
    title: string;
    description: string;
    locationLabel: string;
    startsAt: string;
    endsAt: string;
    allowGuests: boolean;
    recurrenceRule: NativeGroupEventRecurrenceRule | null;
    occurrenceCount: number | null;
    timeZone: string | null;
    localStartsAt: string | null;
    localEndsAt: string | null;
  }) => Promise<void>;
}) {
  const now = useMemo(() => new Date(Date.now() + 60 * 60_000), [open]);
  const endDefault = useMemo(() => new Date(now.getTime() + 60 * 60_000), [now]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [dateValue, setDateValue] = useState(localDateInputValue(now));
  const [startTime, setStartTime] = useState(localTimeInputValue(now));
  const [endTime, setEndTime] = useState(localTimeInputValue(endDefault));
  const [allowGuests, setAllowGuests] = useState(false);
  const [repeatEvent, setRepeatEvent] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<NativeGroupEventRecurrenceRule>("weekly");
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  // One silent snapshot per sheet opening. The labels do not tick while the user
  // is filling the form, avoiding an unnecessary render every minute.
  const [timeZoneClockNow, setTimeZoneClockNow] = useState(() => new Date());
  const formScrollRef = useRef<ScrollView>(null);
  const fieldYRef = useRef<Record<string, number>>({});

  const scrollToEventField = useCallback((field: string) => {
    const scroll = () => formScrollRef.current?.scrollTo({ y: Math.max(0, (fieldYRef.current[field] || 0) - huddleSpacing.x2), animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 180);
  }, []);

  const focusEventField = useCallback((field: string) => {
    setFocusedField(field);
    scrollToEventField(field);
  }, [scrollToEventField]);

  const titleMissing = attempted && !title.trim();
  const descriptionMissing = attempted && !description.trim();
  const locationMissing = attempted && !locationLabel.trim();
  const dateMissing = attempted && !isEventIsoDate(dateValue);
  const startMissing = attempted && !isEventHHMM(startTime);
  const endMissing = attempted && !isEventHHMM(endTime);
  const starts = parseLocalEventDateTime(dateValue, startTime);
  const ends = parseLocalEventDateTime(dateValue, endTime);
  const invalidRange = attempted && Boolean(starts && ends && ends <= starts);
  const isSeriesEdit = Boolean(event?.seriesId);
  const recurrenceMinimum = Math.max(2, event?.occurrenceNumber || 1);
  const canSave = Boolean(title.trim() && description.trim() && locationLabel.trim() && isEventIsoDate(dateValue) && isEventHHMM(startTime) && isEventHHMM(endTime) && starts && ends && ends > starts && (!repeatEvent || (timeZone && occurrenceCount >= recurrenceMinimum && occurrenceCount <= 12)));
  const todayIso = repeatEvent ? eventInputsInTimeZone(new Date().toISOString(), timeZone, new Date()).date : localDateInputValue(new Date());
  const timeZoneOptions = useMemo(
    () => supportedGroupEventTimeZones([event?.timeZone || defaultTimeZone, userLocationTimeZone]),
    [defaultTimeZone, event?.timeZone, userLocationTimeZone],
  );
  const recurrenceLabel = GROUP_EVENT_RECURRENCE_OPTIONS.find((option) => option.value === recurrenceRule)?.label || "Every week";
  const dateParts = eventDatePartsFromIso(dateValue);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, index) => currentYear + 3 - index);
  const minParts = eventDatePartsFromIso(todayIso);
  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => (
    dateParts.year > minParts.year || month >= minParts.month
  ));
  const dayOptions = Array.from({ length: eventDaysInMonth(dateParts.year, dateParts.month) }, (_, index) => index + 1).filter((day) => (
    dateParts.year > minParts.year || dateParts.month > minParts.month || day >= minParts.day
  ));
  const updateDatePart = (patch: Partial<typeof dateParts>) => {
    const next = { ...dateParts, ...patch };
    const nextIso = eventIsoFromParts(next.year, next.month, next.day);
    setDateValue(nextIso < todayIso ? todayIso : nextIso);
    setError("");
  };

  useEffect(() => {
    if (!open) return;
    const start = event ? new Date(event.startsAt) : now;
    const end = event ? new Date(event.endsAt) : endDefault;
    const nextTimeZone = canonicalGroupEventTimeZone(event?.timeZone || defaultTimeZone || deviceTimeZone());
    const startInputs = event?.seriesId
      ? eventInputsInTimeZone(event.startsAt, nextTimeZone, now)
      : { date: localDateInputValue(Number.isFinite(start.getTime()) ? start : now), time: localTimeInputValue(Number.isFinite(start.getTime()) ? start : now) };
    const endInputs = event?.seriesId
      ? eventInputsInTimeZone(event.endsAt, nextTimeZone, endDefault)
      : { date: localDateInputValue(Number.isFinite(end.getTime()) ? end : endDefault), time: localTimeInputValue(Number.isFinite(end.getTime()) ? end : endDefault) };
    setTitle(event?.title || "");
    setDescription(event?.description || "");
    setLocationLabel(event?.locationLabel || "");
    setDateValue(startInputs.date);
    setStartTime(startInputs.time);
    setEndTime(endInputs.time);
    setAllowGuests(event?.allowGuests === true);
    setRepeatEvent(Boolean(event?.seriesId));
    setRecurrenceRule(event?.recurrenceRule || "weekly");
    setOccurrenceCount(Math.max(event?.occurrenceNumber || 2, event?.occurrenceCount || 4));
    setTimeZone(nextTimeZone);
    setRecurrenceOpen(false);
    setTimeZoneOpen(false);
    setError("");
    setAttempted(false);
    setFocusedField(null);
    setDatePickerOpen(false);
    setSlideResetKey((key) => key + 1);
  }, [defaultTimeZone, endDefault, event, now, open]);

  useEffect(() => {
    if (open) setTimeZoneClockNow(new Date());
  }, [open]);

  const submit = async () => {
    setAttempted(true);
    if (!title.trim() || !description.trim() || !locationLabel.trim() || !starts || !ends) {
      const firstMissing = !title.trim() ? "title" : !description.trim() ? "description" : !locationLabel.trim() ? "location" : !starts ? "startTime" : "endTime";
      focusEventField(firstMissing);
      setError("Complete all fields.");
      setSlideResetKey((key) => key + 1);
      return;
    }
    if (ends <= starts) {
      setError("End time must be after start time.");
      setSlideResetKey((key) => key + 1);
      return;
    }
    setError("");
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        locationLabel: locationLabel.trim(),
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        allowGuests,
        recurrenceRule: repeatEvent ? recurrenceRule : null,
        occurrenceCount: repeatEvent ? occurrenceCount : null,
        timeZone: repeatEvent ? timeZone : null,
        localStartsAt: repeatEvent ? `${dateValue}T${startTime}:00` : null,
        localEndsAt: repeatEvent ? `${dateValue}T${endTime}:00` : null,
      });
    } catch (nextError) {
      const message = String((nextError as Error)?.message || nextError || "");
      setError(message.includes("event_quota_reached") ? "Each group can only have 2 events at a time." : "Could not save event.");
      setSlideResetKey((key) => key + 1);
    }
  };

  if (!open) return null;
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={open}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close event sheet" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <AppBottomSheet mode="autoMax" onClose={onClose}>
              <AppBottomSheetHeader>
                <Text style={nativeModalStyles.appModalSheetTitle}>{isSeriesEdit ? "Edit series" : event ? "Edit event" : "Create an event"}</Text>
                <AppModalCloseButton onPress={onClose} />
              </AppBottomSheetHeader>
              <AppBottomSheetScroll contentContainerStyle={styles.groupEventSheetContent} scrollRef={formScrollRef}>
                <View onLayout={(event) => { fieldYRef.current.title = event.nativeEvent.layout.y; }} style={styles.groupEventFieldBlock}>
                  <Text style={styles.groupEventCreateLabel}>Event name</Text>
                  <AppModalField error={titleMissing} focused={focusedField === "title"} onBlur={() => setFocusedField(null)} onChangeText={setTitle} onFocus={() => focusEventField("title")} placeholder="e.g. Sunday dog walk" returnKeyType="done" value={title} />
                </View>
                <View onLayout={(event) => { fieldYRef.current.description = event.nativeEvent.layout.y; }} style={styles.groupEventFieldBlock}>
                  <Text style={styles.groupEventCreateLabel}>Description</Text>
                  <AppModalField error={descriptionMissing} focused={focusedField === "description"} multiline onBlur={() => setFocusedField(null)} onChangeText={setDescription} onFocus={() => focusEventField("description")} placeholder="Add event details" style={styles.groupEventDescriptionInput} value={description} />
                </View>
                <View onLayout={(event) => { fieldYRef.current.location = event.nativeEvent.layout.y; }} style={styles.groupEventFieldBlock}>
                  <Text style={styles.groupEventCreateLabel}>Location</Text>
                  <AppModalField error={locationMissing} focused={focusedField === "location"} onBlur={() => setFocusedField(null)} onChangeText={setLocationLabel} onFocus={() => focusEventField("location")} placeholder="Enter a meeting place" returnKeyType="done" value={locationLabel} />
                </View>
                <View onLayout={(event) => { fieldYRef.current.date = event.nativeEvent.layout.y; }} style={styles.groupEventFieldBlock}>
                  <Text style={styles.groupEventCreateLabel}>Date</Text>
                  <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocusedField(null); setDatePickerOpen((current) => !current); scrollToEventField("date"); }} style={[nativeModalStyles.appModalSelectTrigger, styles.groupEventFieldHeight, datePickerOpen ? nativeModalStyles.appModalFieldFocused : null, dateMissing ? nativeModalStyles.appModalFieldError : null]}>
                    <Text numberOfLines={1} style={nativeModalStyles.appModalSelectText}>{dateValue || "YYYY-MM-DD"}</Text>
                    <Feather color={huddleColors.mutedText} name="calendar" size={17} />
                  </Pressable>
                  {datePickerOpen ? (
                    <View style={styles.groupEventDatePickerColumns}>
                      <ScrollView nestedScrollEnabled style={styles.groupEventDatePickerColumn}>
                        {yearOptions.map((year) => (
                          <Pressable key={year} onPress={() => updateDatePart({ year })} style={[styles.groupEventDatePickerOption, year === dateParts.year ? styles.groupEventDatePickerOptionActive : null]}>
                            <Text style={[styles.groupEventDatePickerOptionText, year === dateParts.year ? styles.groupEventDatePickerOptionTextActive : null]}>{year}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                      <ScrollView nestedScrollEnabled style={styles.groupEventDatePickerColumn}>
                        {monthOptions.map((month) => (
                          <Pressable key={month} onPress={() => updateDatePart({ month })} style={[styles.groupEventDatePickerOption, month === dateParts.month ? styles.groupEventDatePickerOptionActive : null]}>
                            <Text style={[styles.groupEventDatePickerOptionText, month === dateParts.month ? styles.groupEventDatePickerOptionTextActive : null]}>{pad2(month)}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                      <ScrollView nestedScrollEnabled style={styles.groupEventDatePickerColumn}>
                        {dayOptions.map((day) => (
                          <Pressable key={day} onPress={() => updateDatePart({ day })} style={[styles.groupEventDatePickerOption, day === dateParts.day ? styles.groupEventDatePickerOptionActive : null]}>
                            <Text style={[styles.groupEventDatePickerOptionText, day === dateParts.day ? styles.groupEventDatePickerOptionTextActive : null]}>{pad2(day)}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
                <View onLayout={(event) => { fieldYRef.current.startTime = event.nativeEvent.layout.y; fieldYRef.current.endTime = event.nativeEvent.layout.y; }} style={styles.groupEventTwoColumn}>
                  <View style={styles.groupEventFlexField}>
                    <Text style={styles.groupEventCreateLabel}>Start time</Text>
                    <AppModalField error={startMissing || invalidRange} focused={focusedField === "startTime"} keyboardType="numbers-and-punctuation" onBlur={() => { setFocusedField(null); setStartTime((value) => normalizeEventHHMM(value)); }} onChangeText={setStartTime} onFocus={() => focusEventField("startTime")} placeholder="09:00" style={styles.groupEventFieldHeight} value={startTime} />
                  </View>
                  <View style={styles.groupEventFlexField}>
                    <Text style={styles.groupEventCreateLabel}>End time</Text>
                    <AppModalField error={endMissing || invalidRange} focused={focusedField === "endTime"} keyboardType="numbers-and-punctuation" onBlur={() => { setFocusedField(null); setEndTime((value) => normalizeEventHHMM(value)); }} onChangeText={setEndTime} onFocus={() => focusEventField("endTime")} placeholder="17:00" style={styles.groupEventFieldHeight} value={endTime} />
                  </View>
                </View>
              <View style={styles.groupEventToggleStack}>
                <Pressable hitSlop={12} onPress={() => setAllowGuests((current) => !current)} style={styles.groupEventToggleRow}>
                  <View style={[styles.groupEventToggleBox, allowGuests && styles.groupEventToggleBoxActive]}>
                    {allowGuests ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                  </View>
                  <Text style={styles.groupEventToggleText}>Allow additional guests</Text>
                </Pressable>
                <Pressable disabled={isSeriesEdit} hitSlop={12} onPress={() => {
                  const next = !repeatEvent;
                  setRepeatEvent(next);
                  if (next) {
                    // Repeating changes recurrence metadata only. Never replace the
                    // date or times the user has already entered.
                    setTimeZone((current) => current || canonicalGroupEventTimeZone(defaultTimeZone));
                    setTimeout(() => scrollToEventField("repeatFields"), 0);
                  }
                  setRecurrenceOpen(false);
                  setTimeZoneOpen(false);
                }} style={[styles.groupEventToggleRow, isSeriesEdit ? nativeModalStyles.disabled : null]}>
                  <View style={[styles.groupEventToggleBox, repeatEvent && styles.groupEventToggleBoxActive]}>
                    {repeatEvent ? <Feather color={huddleColors.onPrimary} name="check" size={14} /> : null}
                  </View>
                  <Text style={styles.groupEventToggleText}>Repeat event</Text>
                </Pressable>
              </View>
              {repeatEvent ? (
                <View onLayout={(event) => { fieldYRef.current.repeatFields = event.nativeEvent.layout.y; }} style={styles.groupEventRecurrenceFields}>
                  <View style={styles.groupEventTwoColumn}>
                    <View onLayout={(event) => { fieldYRef.current.recurrence = (fieldYRef.current.repeatFields || 0) + event.nativeEvent.layout.y; }} style={styles.groupEventFlexField}>
                      <AppModalSelectField
                        fieldBlockStyle={styles.groupEventFieldBlock}
                        labelStyle={styles.groupEventCreateLabel}
                        label="REPEATS"
                        open={recurrenceOpen}
                        options={GROUP_EVENT_RECURRENCE_OPTIONS.map((option) => option.label)}
                        optionStyle={styles.groupEventSelectOption}
                        placeholder="Select frequency"
                        triggerStyle={styles.groupEventFieldHeight}
                        value={recurrenceLabel}
                        onSelect={(label) => {
                          const next = GROUP_EVENT_RECURRENCE_OPTIONS.find((option) => option.label === label);
                          if (next) setRecurrenceRule(next.value);
                          setRecurrenceOpen(false);
                        }}
                        onToggle={() => {
                          Keyboard.dismiss();
                          setTimeZoneOpen(false);
                          const next = !recurrenceOpen;
                          setRecurrenceOpen(next);
                          if (next) scrollToEventField("recurrence");
                        }}
                      />
                    </View>
                    <View style={[styles.groupEventFieldBlock, styles.groupEventFlexField]}>
                      <Text style={styles.groupEventCreateLabel}>FOR</Text>
                      <View style={[nativeModalStyles.appModalSelectTrigger, styles.groupEventFieldHeight, styles.groupEventStepper]}>
                        <AppModalIconButton accessibilityLabel="Fewer events" disabled={occurrenceCount <= recurrenceMinimum} onPress={() => setOccurrenceCount((current) => Math.max(recurrenceMinimum, current - 1))}>
                          <Feather color={huddleColors.iconMuted} name="minus" size={18} />
                        </AppModalIconButton>
                        <Text style={styles.groupEventStepperValue}>{occurrenceCount} events</Text>
                        <AppModalIconButton accessibilityLabel="More events" disabled={occurrenceCount >= 12} onPress={() => setOccurrenceCount((current) => Math.min(12, current + 1))}>
                          <Feather color={huddleColors.iconMuted} name="plus" size={18} />
                        </AppModalIconButton>
                      </View>
                    </View>
                  </View>
                  <View onLayout={(event) => { fieldYRef.current.timeZone = (fieldYRef.current.repeatFields || 0) + event.nativeEvent.layout.y; }}>
                    <AppModalSelectField
                      fieldBlockStyle={styles.groupEventFieldBlock}
                      formatLabel={(value) => groupEventTimeZoneLabel(value, timeZoneClockNow)}
                      labelStyle={styles.groupEventCreateLabel}
                      label="TIME ZONE"
                      open={timeZoneOpen}
                      options={timeZoneOptions}
                      optionStyle={styles.groupEventSelectOption}
                      placeholder="Select time zone"
                      triggerStyle={styles.groupEventFieldHeight}
                      value={timeZone}
                      onSelect={(value) => {
                        setTimeZone(value);
                        setTimeZoneOpen(false);
                      }}
                      onToggle={() => {
                        Keyboard.dismiss();
                        setRecurrenceOpen(false);
                        const next = !timeZoneOpen;
                        setTimeZoneOpen(next);
                        if (next) scrollToEventField("timeZone");
                      }}
                    />
                  </View>
                </View>
              ) : null}
              {error ? <AppModalError>{error}</AppModalError> : null}
              </AppBottomSheetScroll>
              <AppBottomSheetFooter>
                <SlideToConfirm
                  busy={saving}
                  disabled={!canSave || saving}
                  label={event ? "Slide to Update" : "Slide to Create"}
                  onCommit={() => { void submit(); }}
                  onDisabledPress={() => {
                    setAttempted(true);
                    setError("Complete all fields.");
                    setSlideResetKey((key) => key + 1);
                  }}
                  resetKey={slideResetKey}
                />
              </AppBottomSheetFooter>
        </AppBottomSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function VerifiedAvatarBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return <View style={styles.verifiedBadge}><NativeVerifiedBadge compact variant="avatar" /></View>;
}

function ConfirmModal({
  body,
  cancel = "Cancel",
  confirm,
  destructive = false,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (destructive) {
    return (
      <AppDestructiveSlideConfirm
        body={body}
        onClose={onCancel}
        onConfirm={onConfirm}
        open={open}
        slideLabel={`Slide to ${confirm}`}
        title={title}
      />
    );
  }
  return (
    <AppConfirmModal
      body={body}
      cancel={cancel}
      confirm={confirm}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={title}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: huddleColors.canvas },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderBottomWidth: 1, borderBottomColor: huddleColors.divider, backgroundColor: huddleColors.glassOverlay },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  identityText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  avatarWrap: { position: "relative" },
  avatar: { width: 36, height: 36, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.glassControl, overflow: "hidden" },
  teamHuddleAvatar: { backgroundColor: huddleColors.canvas },
  avatarVerified: { borderWidth: 1, borderColor: huddleColors.blue },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  verifiedBadge: { position: "absolute", right: -4, bottom: -3 },
  headerSkeletonAvatar: { backgroundColor: huddleColors.mutedCanvas },
  headerSkeletonTitle: { width: "54%", height: huddleType.labelLine, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  headerSkeletonSubtitle: { width: "36%", height: huddleType.helperLine, marginTop: huddleSpacing.x1, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  title: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  subtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, padding: huddleSpacing.x5 },
  emptyTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text, textAlign: "center" },
  emptyBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext, textAlign: "center" },
  emptyAction: { marginTop: huddleSpacing.x2, ...huddleButtons.base, ...huddleButtons.primary, paddingHorizontal: huddleSpacing.x5 },
  emptyActionText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  emptyInline: { alignSelf: "flex-start", paddingVertical: huddleSpacing.x2, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  messages: { flexGrow: 1, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x10, gap: huddleSpacing.x2 },
  messagesKeyboard: { paddingBottom: huddleSpacing.x2 },
  messagesScroll: { flex: 1 },
  messagesLoading: { flex: 1 },
  groupEventPinnedStack: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider, backgroundColor: huddleColors.canvas },
  groupEventStack: { gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x2 },
  groupEventCard: { position: "relative", overflow: "hidden", borderRadius: huddleRadii.glass, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.sectionDividerStrong, backgroundColor: huddleColors.glassOverlay, shadowColor: huddleColors.neutralShadow, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  groupEventPhaseStrip: { position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: huddleColors.blueLight },
  groupEventBody: { minWidth: 0, gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  groupEventHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  groupEventTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupEventTitle: { flex: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineSnug, color: huddleColors.text },
  groupEventActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupEventIconButton: { alignItems: "center", justifyContent: "center" },
  groupEventRsvpIconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  groupEventDescription: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  groupEventMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupEventSubtext: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  groupEventRsvpRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupEventAvatarStack: { flexDirection: "row", alignItems: "center" },
  groupEventAvatar: { width: 24, height: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.canvas, backgroundColor: huddleColors.blue },
  groupEventAvatarOverlap: { marginLeft: -8 },
  groupEventAvatarImage: { width: "100%", height: "100%" },
  groupEventAvatarText: { fontFamily: "Urbanist-600", fontSize: 10, lineHeight: 12, color: huddleColors.onPrimary },
  groupEventOverflow: { marginLeft: huddleSpacing.x1, fontFamily: "Urbanist-600", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.text },
  groupEventGoingText: { flexShrink: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupEventJoinButtonBusy: { opacity: 0.58 },
  groupEventSheetContent: { gap: huddleSpacing.x5, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x4, paddingBottom: huddleSpacing.x5 },
  groupEventFieldBlock: { gap: huddleSpacing.x2 },
  groupEventDescriptionInput: { minHeight: 112, textAlignVertical: "top" },
  groupEventCreateLabel: { paddingLeft: 0, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, letterSpacing: 1, textTransform: "uppercase", color: huddleColors.mutedText },
  groupEventDatePickerColumns: { flexDirection: "row", gap: huddleFormControls.datePicker.columnGap, padding: huddleFormControls.datePicker.columnPadding },
  groupEventDatePickerColumn: { flex: 1, maxHeight: huddleFormControls.datePicker.columnMaxHeight, borderRadius: huddleFormControls.datePicker.columnRadius, backgroundColor: huddleColors.mutedCanvas },
  groupEventDatePickerOption: { minHeight: huddleFormControls.datePicker.optionMinHeight, alignItems: "center", justifyContent: "center", borderRadius: huddleFormControls.datePicker.optionRadius },
  groupEventDatePickerOptionActive: { backgroundColor: huddleColors.blue },
  groupEventDatePickerOptionText: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  groupEventDatePickerOptionTextActive: { color: huddleColors.onPrimary },
  groupEventTwoColumn: { flexDirection: "row", gap: huddleSpacing.x2 },
  groupEventFlexField: { flex: 1, minWidth: 0, gap: huddleSpacing.x2 },
  groupEventFieldHeight: { minHeight: huddleLayout.fieldHeight, height: huddleLayout.fieldHeight },
  groupEventToggleRow: { height: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  // The visible checkbox rows are exactly 4px apart; hitSlop preserves a generous
  // touch target without inflating the visual gap.
  groupEventToggleStack: { gap: 4 },
  groupEventToggleBox: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1.5, borderColor: huddleColors.fieldBorder, backgroundColor: huddleColors.canvas },
  groupEventToggleBoxActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  groupEventToggleText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupEventRecurrenceFields: { gap: huddleSpacing.x5 },
  groupEventSelectOption: { minHeight: huddleLayout.minTouch + huddleSpacing.x1 },
  groupEventStepper: { paddingHorizontal: huddleSpacing.x2 },
  groupEventStepperValue: { flex: 1, textAlign: "center", fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupEventError: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  dayDivider: { alignSelf: "center", marginVertical: huddleSpacing.x2, paddingHorizontal: 10, paddingVertical: 2, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.toggleOff, fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  roomCodeWrap: { paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x1, borderTopWidth: 1, borderTopColor: huddleColors.cardBorderSoft },
  roomCode: { alignSelf: "center", paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.coralSoftFill, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.coral },
  systemPill: { alignSelf: "center", maxWidth: "80%", marginVertical: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.glassControl, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.blue, textAlign: "center" },
  membershipPill: { alignSelf: "center", marginVertical: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.toggleOff, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.mutedText, textAlign: "center" },
  latestButton: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  latestText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  editModeScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.chatEditScrim, zIndex: 1 },
  editingFocusWrap: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, zIndex: 3, alignItems: "flex-end" },
  editingFocusBubble: { maxWidth: "86%", shadowColor: huddleColors.neutralShadow, shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  senderName: { marginLeft: huddleSpacing.x1, marginBottom: 2, fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  messageRowMine: { justifyContent: "flex-end" },
  messageSwipeFrame: { position: "relative" },
  targetMessageFrame: { borderRadius: huddleRadii.card, backgroundColor: huddleColors.coralSoftFill, padding: huddleSpacing.x1 },
  messageSwipeFrameMine: { alignItems: "flex-end" },
  messageSwipeFrameActionsOpen: { paddingBottom: huddleSpacing.x5 },
  messageRowActionsOpen: { paddingRight: huddleSpacing.x8 },
  messageActionStack: { position: "absolute", top: 0, right: 0, zIndex: 2, gap: huddleSpacing.x1 },
  messageActionButton: { width: 40, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.card, backgroundColor: huddleColors.blue },
  messageDeleteButton: { backgroundColor: huddleColors.validationRed },
  messageBubble: { maxWidth: "90%", borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderWidth: 0 },
  messageBubbleRich: { paddingTop: 0, paddingHorizontal: 0, paddingBottom: huddleSpacing.x2 },
  // Image-only bubbles must not carry the sender's solid fill as bubble padding — that
  // produced an uneven colored mat (thick on 3 sides, flush at the bottom, since only
  // paddingBottom was zeroed) instead of a clean frame. Zero all padding here so the image
  // fills the bubble edge to edge, and trace the sender color as a thin border instead via
  // messageBubbleMediaOnlyMine/Theirs below (applied after the mine/theirs fill so it wins).
  messageBubbleMediaOnly: { overflow: "hidden", padding: 0, borderWidth: 1.5 },
  messageBubbleMine: { backgroundColor: huddleColors.membershipUpgradePlus },
  messageBubbleTheirs: { backgroundColor: huddleColors.coral },
  messageBubbleCounterpart: { backgroundColor: huddleColors.coral },
  messageBubbleStar: { backgroundColor: huddleColors.coral },
  messageBubbleMediaOnlyMine: { backgroundColor: "transparent", borderColor: huddleColors.membershipUpgradePlus },
  messageBubbleMediaOnlyTheirs: { backgroundColor: "transparent", borderColor: huddleColors.coral },
  messageBubbleTarget: { borderWidth: 2, borderColor: huddleColors.coral },
  messageText: { fontFamily: "Urbanist-500", fontSize: 16, lineHeight: 22, color: huddleColors.onPrimary },
  messageDeletedText: { color: huddleColors.onPrimary, fontStyle: "italic" },
  messageTextRich: { paddingHorizontal: huddleSpacing.x3, paddingTop: huddleSpacing.x2 },
  messageTextMine: { color: huddleColors.onPrimary },
  starText: { fontFamily: "Urbanist-700", fontSize: 16, lineHeight: 22, color: huddleColors.onPrimary },
  messageMeta: { flexDirection: "row", gap: huddleSpacing.x1, marginTop: huddleSpacing.x1, paddingLeft: huddleSpacing.x1 },
  messageMetaMine: { justifyContent: "flex-end", paddingRight: huddleSpacing.x1 },
  messageMetaActionsOpen: { paddingRight: huddleSpacing.x8 },
  messageTime: { fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  failedMessageActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  failedMessageActionButton: { minHeight: 28, justifyContent: "center", paddingHorizontal: huddleSpacing.x1 },
  failedMessageRetryText: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.blue },
  failedMessageDismissText: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  readMark: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  readMarkSeen: { color: huddleColors.blue },
  chatAttachmentCarousel: { alignSelf: "flex-start", maxWidth: 260, overflow: "hidden", borderRadius: huddleRadii.card, backgroundColor: "transparent" },
  mediaBlock: { backgroundColor: "transparent" },
  mediaViewport: { overflow: "hidden", borderRadius: huddleRadii.card, backgroundColor: "transparent" },
  mediaPagingRow: { alignItems: "center" },
  mediaFrame: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  mediaImageContainBox: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  mediaImage: {},
  mediaFallback: { width: "100%", height: "100%", backgroundColor: huddleColors.glassControl },
  carouselControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, paddingTop: huddleSpacing.x1 },
  carouselButton: { width: huddleSocial.carouselButtonSize, height: huddleSocial.carouselButtonSize, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas },
  carouselButtonDisabled: { opacity: 0.35 },
  carouselDot: { width: huddleSocial.carouselDotSize, height: huddleSocial.carouselDotSize, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.iconSubtle },
  carouselDotActive: { width: huddleSocial.carouselActiveDotWidth, backgroundColor: huddleColors.blue },
  sensitiveRevealHint: { display: "none" },
  sensitiveOverlay: { position: "absolute", alignItems: "center", justifyContent: "center" },
  sensitiveGlassVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.glassOverlay },
  sensitiveDimVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.backdrop },
  sensitiveText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.onPrimary },
  videoBadge: { position: "absolute", alignItems: "center", justifyContent: "center" },
  processingPill: { position: "absolute", right: huddleSpacing.x2, top: huddleSpacing.x2, borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.backdrop },
  processingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.onPrimary },
  expandedBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  expandedHeader: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 4, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x8 },
  expandedHeaderSpacer: { flex: 1 },
  expandedHeaderActions: { flexDirection: "row", gap: huddleSpacing.x2 },
  expandedIconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop },
  expandedSlide: { flex: 1, alignItems: "center", justifyContent: "center" },
  expandedMediaFrame: { alignItems: "center", justifyContent: "center" },
  expandedImage: { width: "100%", height: "100%" },
  expandedVideo: { width: "100%", height: "100%" },
  expandedImageWrap: { width: "100%", height: "100%" },
  expandedVideoUnavailable: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, backgroundColor: huddleColors.backdrop },
  expandedVideoUnavailableText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  expandedSensitiveOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  expandedSensitiveTapArea: { alignItems: "center", justifyContent: "center" },
  expandedDots: { position: "absolute", bottom: huddleSpacing.x8, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2 },
  expandedDot: { width: huddleSocial.carouselDotSize, height: huddleSocial.carouselDotSize, borderRadius: huddleRadii.pill, backgroundColor: "rgba(255,255,255,0.45)" },
  expandedDotActive: { width: huddleSocial.carouselActiveDotWidth, backgroundColor: huddleColors.onPrimary },
  attachmentFallbackFrame: { width: 260, height: 210, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.card, backgroundColor: huddleColors.glassControl },
  attachmentFallbackText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  messageLinkPreview: { marginTop: 0, borderWidth: 0, borderRadius: huddleRadii.card, shadowOpacity: 0, elevation: 0 },
  chatShareCard: { width: 286, maxWidth: "90%", overflow: "hidden", borderRadius: 18, borderWidth: 0, shadowColor: "rgba(36,55,120,0.32)", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 2 },
  chatShareCardMine: { backgroundColor: huddleColors.membershipUpgradePlus, shadowColor: "rgba(11,18,48,0.28)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18 },
  chatShareCardTheirs: { backgroundColor: huddleColors.coral },
  chatShareCardBody: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x3 },
  shareThumb: { width: 72, height: 72, overflow: "hidden", borderRadius: 14, backgroundColor: "rgba(244,247,251,0.95)" },
  shareThumbImage: { width: "100%", height: "100%" },
  shareTextWrap: { flex: 1, minWidth: 0 },
  shareSurface: { marginBottom: 2, fontFamily: "Urbanist-800", fontSize: 10, lineHeight: 13, color: huddleColors.blue, textTransform: "uppercase" },
  shareTitle: { fontFamily: "Urbanist-700", fontSize: 13, lineHeight: 20, color: "#424965" },
  shareDescription: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 20, color: "#6B728A" },
  shareTextOnBubble: { color: huddleColors.onPrimary },
  shareDescriptionOnBubble: { color: "rgba(255,255,255,0.82)" },
  uploadRail: { gap: huddleSpacing.x2, paddingRight: huddleSpacing.x6, paddingBottom: huddleSpacing.x1 },
  uploadThumb: { width: huddleSpacing.x9, height: huddleSpacing.x9, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.button, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.mutedCanvas },
  uploadImage: { width: "100%", height: "100%" },
  uploadVideoThumb: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.backdrop },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, backgroundColor: huddleColors.backdrop },
  uploadingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: 16, color: huddleColors.onPrimary },
  removeUpload: { position: "absolute", top: 2, right: 2, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop },
  safetyLock: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.coralSoftFill },
  safetyText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  dialogueComposerSurface: { gap: huddleSpacing.x2, paddingTop: huddleSpacing.x2, zIndex: 4 },
  groupComposerMenuInline: { position: "absolute", left: huddleSpacing.x3, bottom: "100%", zIndex: 8, marginBottom: huddleSpacing.x2 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  attachButton: { width: 18, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 0, backgroundColor: "transparent" },
  sendButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  menuText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  menuTextDestructive: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.validationRed },
  sheetHeader: { borderBottomWidth: 0 },
  sheetTitle: { flex: 1, fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  groupInfoSheetBody: { gap: huddleSpacing.x4 },
  groupCoverBusy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.backdrop },
  dialogueGroupHeroAvatarAction: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x10, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.backdrop },
  groupInfoSection: { gap: huddleSpacing.x2 },
  groupInfoHeaderIdentity: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  groupInfoHeaderAvatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.glassControl },
  groupInfoHeaderAvatarImage: { width: "100%", height: "100%" },
  groupInfoHeaderTitleWrap: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  groupInfoHeaderTitle: { flex: 0, lineHeight: huddleType.h4Line, textAlignVertical: "center" },
  groupInfoNameField: { minHeight: 44, paddingVertical: 0 },
  groupInfoNameButton: { ...huddleGlassControls.surface, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  groupInfoMetaStack: { gap: huddleSpacing.x1 },
  groupInfoMetaRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupInfoRole: { flexShrink: 0, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  sheetBody: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: huddleType.body * huddleType.lineNormal, color: huddleColors.subtext },
  sheetMeta: { marginTop: huddleSpacing.x2, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  groupMediaRail: { maxHeight: 100, marginTop: huddleSpacing.x2 },
  groupMediaThumb: { width: 96, height: 96, marginRight: huddleSpacing.x2, borderRadius: huddleRadii.card },
  mediaEmptyRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingVertical: huddleSpacing.x2 },
  sheetActions: { gap: huddleSpacing.x2, marginTop: huddleSpacing.x4 },
  sheetAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x3, borderRadius: huddleRadii.card },
  sheetActionText: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  sheetActionDestructive: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.validationRed },
  manageContent: { gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x6 },
  manageHeaderTitle: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  managementActionRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas },
  managementActionCopy: { flex: 1, minWidth: 0 },
  managementActionTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  managementActionBody: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  descriptionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  manageLabel: { marginTop: huddleSpacing.x2, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, letterSpacing: 1.2, color: huddleColors.mutedText, textTransform: "uppercase" },
  memberRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  memberIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  memberAvatar: { width: 34, height: 34, borderRadius: huddleRadii.pill },
  memberName: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  memberRemove: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.validationRed },
  addMemberButton: { ...huddleGlassControls.surface, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  compactButtonText: { ...huddleButtons.label, fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  confirmContent: { gap: huddleSpacing.x3, padding: huddleSpacing.x4, paddingTop: huddleSpacing.x5 },
  confirmTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  confirmBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  secondaryActionText: { ...huddleButtons.label, color: huddleColors.text },
  primaryActionText: { ...huddleButtons.label, color: huddleColors.onPrimary },
});
