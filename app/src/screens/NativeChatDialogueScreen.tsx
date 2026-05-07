import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import teamHuddleLogo from "../../assets/huddle-logo-transparent.png";
import profilePlaceholder from "../../huddle Design System/assets/ProfilePlaceholder.png";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSocialExternalLinkPreview } from "../components/social/NativeSocialFeedPrimitives";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { AppActionMenu, AppBottomSheet, AppBottomSheetFooter, AppBottomSheetHeader, AppBottomSheetScroll, AppModalActionRow, AppModalButton, AppModalCard, AppModalField, AppModalIconButton } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import {
  deleteOwnNativeChatAttachment,
  ensureNativeDirectChatRoom,
  fetchNativeChatMembers,
  fetchNativeChatMessages,
  fetchNativeChatRoom,
  fetchNativeReadReceipts,
  isNativeTeamHuddleIdentity,
  markNativeChatRoomSeen,
  markNativeChatRoomRead,
  markNativeChatMessagesRead,
  NATIVE_CHAT_ATTACHMENTS_BUCKET,
  parseNativeChatRouteParams,
  sendNativeChatMessage,
  TEAM_HUDDLE_AVAILABILITY,
  TEAM_HUDDLE_DISPLAY_NAME,
  TEAM_HUDDLE_USER_ID,
  updateNativeGroupChatMetadata,
  uploadNativeChatAttachment,
  type NativeChatMessage,
  type NativeChatRoom,
} from "../lib/nativeChat";
import { haptic } from "../lib/nativeHaptics";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import {
  extractNativeSocialFirstHttpUrl,
  fetchNativeSocialLinkPreviews,
  stripNativeSocialExternalUrlFromText,
  type NativeSocialLinkPreview,
} from "../lib/nativeSocial";
import { ensureSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { supabase } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleRadii, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

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
  linkPreviewUrl: string | null;
  senderId: string | null;
  recipientId: string | null;
  share: { title?: string; description?: string; imageUrl?: string; appUrl?: string; canonicalUrl?: string; chatHeadline?: string; surface?: string } | null;
};

type PendingMedia = {
  height: number | null;
  uri: string;
  name: string;
  mime: string;
  size: number | null;
  status: "queued" | "uploading" | "uploaded" | "error";
  width: number | null;
};

type GroupManageMember = { id: string; name: string; avatarUrl: string | null; socialId: string | null; isVerified: boolean };

const INITIAL_MESSAGE_LOAD_SIZE = 10;
const OLDER_MESSAGE_PAGE_SIZE = 20;
const MESSAGE_READ_BUFFER_MS = 100;

const clean = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const extractFirstHttpUrl = extractNativeSocialFirstHttpUrl;
const stripUrl = stripNativeSocialExternalUrlFromText;

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";

function ResilientAvatarImage({
  fallback,
  resizeMode = "cover",
  style,
  uri,
}: {
  fallback: ReactNode;
  resizeMode?: "cover" | "contain";
  style: StyleProp<ImageStyle>;
  uri: string | null | undefined;
}) {
  const resolved = useMemo(() => resolveNativeAvatarUrl(uri) || (typeof uri === "string" && /^https?:\/\//i.test(uri) ? uri : null), [uri]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);
  if (!resolved || failed) return <>{fallback}</>;
  return <Image onError={() => setFailed(true)} resizeMode={resizeMode} source={{ uri: resolved }} style={style} />;
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
  if (days <= 0) return "";
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt);
  return `${String(dt.getDate()).padStart(2, "0")}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
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

const parseMessageContent = (content: string): ParsedMessage => {
  const star = parseStarChatContent(content);
  if (isStarIntroKind(star.kind)) {
    return {
      text: star.text || "Star connection started.",
      attachments: [],
      kind: star.kind,
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
    if (share) return { text: "", attachments: [], kind: "huddle_share", linkPreviewUrl: null, senderId: null, recipientId: null, share };
    const rawAttachments = Array.isArray(envelope.attachments) ? envelope.attachments : [];
    return {
      text: String(envelope.text || ""),
      kind: clean(envelope.kind),
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
    return { text: content, attachments: [], kind: null, linkPreviewUrl: null, senderId: null, recipientId: null, share: null };
  }
};

async function resolveAttachmentUrls(messages: NativeChatMessage[]) {
  const paths = new Set<string>();
  messages.forEach((message) => {
    parseMessageContent(message.content).attachments.forEach((attachment) => {
      if (attachment.path && (!attachment.bucket || attachment.bucket === NATIVE_CHAT_ATTACHMENTS_BUCKET)) {
        paths.add(attachment.path);
      }
    });
  });
  const resolved: Record<string, string | null> = {};
  const uniquePaths = Array.from(paths);
  if (uniquePaths.length === 0) return resolved;
  const { data, error } = await supabase.storage.from(NATIVE_CHAT_ATTACHMENTS_BUCKET).createSignedUrls(uniquePaths, 60 * 60 * 24 * 30);
  if (error) {
    uniquePaths.forEach((path) => {
      resolved[path] = null;
    });
    return resolved;
  }
  uniquePaths.forEach((path, index) => {
    resolved[path] = data?.[index]?.signedUrl || null;
  });
  return resolved;
}

async function fetchProfiles(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,social_id,avatar_url,availability_status,social_role,user_role,verification_status,is_verified,has_car")
    .in("id", unique)
    .limit(unique.length);
  const map: Record<string, ProfileSummary> = {};
  for (const row of data || []) {
    const source = row as Record<string, unknown>;
    const availability = Array.isArray(source.availability_status)
      ? source.availability_status.map((entry) => String(entry || "").trim()).filter(Boolean).join(" • ")
      : null;
    const socialRole = clean(source.social_role) || clean(source.user_role) || availability || "Pet Parent";
    const id = String(source.id || "");
    if (!id) continue;
    const rawDisplayName = clean(source.display_name) || "Huddle member";
    const rawSocialId = clean(source.social_id);
    const isTeamHuddle = id === TEAM_HUDDLE_USER_ID || isNativeTeamHuddleIdentity(rawDisplayName, rawSocialId);
    map[id] = {
      id,
      displayName: isTeamHuddle ? TEAM_HUDDLE_DISPLAY_NAME : rawDisplayName,
      socialId: isTeamHuddle ? "teamhuddle" : rawSocialId,
      avatarUrl: isTeamHuddle ? null : resolveNativeAvatarUrl(source.avatar_url),
      availability: isTeamHuddle ? TEAM_HUDDLE_AVAILABILITY : socialRole,
      isVerified: source.is_verified === true || String(source.verification_status || "").toLowerCase() === "verified",
      hasCar: source.has_car === true,
      isTeamHuddle,
    };
  }
  return map;
}

export function NativeChatDialogueScreen({
  onGoBack,
  onNavigate,
  search,
  userId,
}: {
  onGoBack: () => void;
  onNavigate: (path: string) => void;
  search?: string;
  userId: string | null;
}) {
  const insets = useSafeAreaInsets();
  const params = useMemo(() => parseNativeChatRouteParams(search || ""), [search]);
  const [roomId, setRoomId] = useState<string | null>(params.room);
  const [loadedRoomId, setLoadedRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<NativeChatRoom | null>(null);
  const [messages, setMessages] = useState<NativeChatMessage[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [counterpart, setCounterpart] = useState<ProfileSummary | null>(null);
  const [groupOwner, setGroupOwner] = useState<ProfileSummary | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupMuted, setGroupMuted] = useState(false);
  const [blockState, setBlockState] = useState<BlockState>("none");
  const [unmatchState, setUnmatchState] = useState<UnmatchState>("none");
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string | null>>({});
  const [linkPreviews, setLinkPreviews] = useState<Record<string, NativeSocialLinkPreview>>({});
  const [input, setInput] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [mediaPreviewUri, setMediaPreviewUri] = useState<string | null>(null);
  const [uploads, setUploads] = useState<PendingMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
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
  const [confirmUnmatchOpen, setConfirmUnmatchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [chatDisabledBySafety, setChatDisabledBySafety] = useState(false);
  const [currentUserTier, setCurrentUserTier] = useState("free");
  const [currentUserVerified, setCurrentUserVerified] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [groupAvatarBusy, setGroupAvatarBusy] = useState<"upload" | "remove" | null>(null);
  const [groupVerifyGateOpen, setGroupVerifyGateOpen] = useState(false);
  const [groupManageReturnToInfo, setGroupManageReturnToInfo] = useState(false);
  const [groupDescriptionEditing, setGroupDescriptionEditing] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [groupMemberReportTarget, setGroupMemberReportTarget] = useState<GroupManageMember | null>(null);
  const [groupMemberBlockTarget, setGroupMemberBlockTarget] = useState<GroupManageMember | null>(null);
  const [groupMemberActionTarget, setGroupMemberActionTarget] = useState<GroupManageMember | null>(null);
  const readQueueRef = useRef<Set<string>>(new Set());
	  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	  const scrollRef = useRef<ScrollView | null>(null);
	  const nearBottomRef = useRef(true);
	  const messagesRef = useRef<NativeChatMessage[]>([]);
	  const roomIdRef = useRef<string | null>(roomId);
  const linkPreviewRequestsRef = useRef<Set<string>>(new Set());
  const groupMemberActionTargetRef = useRef<GroupManageMember | null>(null);

  const isGroup = room?.type === "group";
  const headerReady = Boolean(room && loadedRoomId && roomId && loadedRoomId === roomId && !loading);
  const title = isGroup ? room?.name || params.name || "Group" : counterpart?.displayName || params.name || "Conversation";
  const memberCountLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  const typedPreviewUrl = extractFirstHttpUrl(input);
  const activePreviewUrl = lockedPreviewUrl || (typedPreviewUrl && !dismissedPreviewUrls.has(typedPreviewUrl) ? typedPreviewUrl : null);
  const composerDisabled = sending || chatDisabledBySafety || blockState !== "none" || unmatchState !== "none";
  const canSendVideo = currentUserTier.trim().toLowerCase() === "gold";
  const uploadProgress = useMemo(() => {
    if (uploads.length === 0) return null;
    if (!uploads.some((item) => item.status === "uploading")) return null;
    const completed = uploads.filter((item) => item.status === "uploaded").length;
    return Math.round((completed / uploads.length) * 100);
  }, [uploads]);

	  const flushReads = useCallback(async () => {
	    const targetRoomId = roomIdRef.current;
	    if (!targetRoomId || !userId || readQueueRef.current.size === 0) return;
	    const ids = Array.from(readQueueRef.current);
	    readQueueRef.current.clear();
	    try {
	      await markNativeChatMessagesRead({ roomId: targetRoomId, userId, messageIds: ids });
	    } catch {
	      ids.forEach((id) => readQueueRef.current.add(id));
	    }
	  }, [userId]);

	  useEffect(() => {
	    roomIdRef.current = roomId;
	  }, [roomId]);

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

  const latestStarIntro = useMemo(() => {
    if (isGroup) return null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const parsed = parseMessageContent(messages[index].content);
      if (isStarIntroKind(parsed.kind)) return parsed;
    }
    return null;
  }, [isGroup, messages]);

  const firstStarUserMessageId = useMemo(() => {
    if (!latestStarIntro?.senderId || isGroup) return null;
    for (const message of messages) {
      const parsed = parseMessageContent(message.content);
      if (isStarIntroKind(parsed.kind)) continue;
      if (message.senderId !== latestStarIntro.senderId) continue;
      if (parsed.attachments.length === 0 && !parsed.text.trim()) continue;
      return message.id;
    }
    return null;
  }, [isGroup, latestStarIntro?.senderId, messages]);

  const groupMediaAttachments = useMemo(() => {
    if (!isGroup) return [];
    return messages
      .flatMap((message) => parseMessageContent(message.content).attachments)
      .map((attachment) => ({
        key: attachment.path || attachment.url,
        mime: attachment.mime,
        uri: attachment.url || (attachment.path ? attachmentUrls[attachment.path] : null),
      }))
      .filter((attachment): attachment is { key: string; mime: string; uri: string } => Boolean(attachment.key && attachment.uri) && !attachment.mime.startsWith("video/"));
  }, [attachmentUrls, isGroup, messages]);

  const queueReads = useCallback((rows: NativeChatMessage[]) => {
    if (!userId) return;
    rows.forEach((message) => {
      if (message.senderId !== userId) readQueueRef.current.add(message.id);
    });
    if (readTimerRef.current) return;
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      void flushReads();
    }, MESSAGE_READ_BUFFER_MS);
  }, [flushReads, userId]);

  const refreshMembershipSnapshot = useCallback(async (targetRoomId: string) => {
    if (!userId) return;
    if (__DEV__) console.debug("[native.chat] membership_snapshot_start", { roomId: targetRoomId });
    try {
      const [roomRow, memberRows] = await Promise.all([
        fetchNativeChatRoom(targetRoomId),
        fetchNativeChatMembers(targetRoomId),
      ]);
      if (roomRow) setRoom(roomRow);
      setMemberCount(memberRows.length);
      const profileMap = memberRows.length > 0 ? await fetchProfiles(memberRows.map((member) => member.userId)) : {};
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
      if (roomRow?.type === "group") {
        const { data: memberState } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_native_group_member_state", {
          p_chat_id: targetRoomId,
        });
        const row = Array.isArray(memberState) ? memberState[0] as { is_muted?: boolean; role?: string } | undefined : null;
        setGroupMuted(row?.is_muted === true);
        setIsAdmin(roomRow.createdBy === userId || String(row?.role || ownMember?.role || "").toLowerCase() === "admin");
      }
      if (__DEV__) console.debug("[native.chat] membership_snapshot_done", { roomId: targetRoomId, memberCount: memberRows.length });
    } catch (error) {
      console.warn("[native.chat] membership_snapshot_refresh_failed", { roomId: targetRoomId, message: error instanceof Error ? error.message : String(error) });
    }
  }, [userId]);

		  const hydrateMessages = useCallback(async (rows: NativeChatMessage[], options?: { scrollToLatest?: boolean }) => {
	    messagesRef.current = rows;
	    setMessages(rows);
    setAttachmentUrls(await resolveAttachmentUrls(rows));
    if (userId) setReadMessageIds(await fetchNativeReadReceipts(rows.filter((message) => message.senderId === userId).map((message) => message.id), userId));
    const urls = Array.from(new Set(rows.map((message) => {
      const parsed = parseMessageContent(message.content);
      return parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
    }).filter((url): url is string => Boolean(url))));
    if (urls.length > 0) {
      const previews = await fetchNativeSocialLinkPreviews(urls);
      setLinkPreviews((current) => ({ ...current, ...previews }));
    }
    queueReads(rows);
    if (options?.scrollToLatest !== false) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
	        markCurrentRoomSeen(undefined, rows[rows.length - 1]?.createdAt || null);
	      }, 80);
	    }
	  }, [markCurrentRoomSeen, queueReads, userId]);

  const loadRoom = useCallback(async (targetRoomId: string, hintUserId?: string | null) => {
    if (!userId) return;
    const [roomRow, memberRows] = await Promise.all([
      fetchNativeChatRoom(targetRoomId),
      fetchNativeChatMembers(targetRoomId),
    ]);
    if (!roomRow) throw new Error("room_not_found");
    if (!memberRows.some((member) => member.userId === userId)) throw new Error("room_not_accessible");
    if (hintUserId && roomRow.type !== "direct") throw new Error("direct_room_type_mismatch");
    if (roomRow.type === "service") throw new Error("service_room_wrong_surface");
    setRoom(roomRow);
    setMemberCount(memberRows.length);
    setIsAdmin(roomRow.createdBy === userId);
    const [profileMap, viewerProfile] = await Promise.all([
      fetchProfiles(memberRows.map((member) => member.userId)),
      supabase.from("profiles").select("id,is_verified,verification_status,tier,effective_tier,display_name").eq("id", userId).limit(1).maybeSingle(),
    ]);
    const viewerRow = viewerProfile.data as Record<string, unknown> | null;
    setCurrentUserTier(clean(viewerRow?.effective_tier) || clean(viewerRow?.tier) || "free");
    setCurrentUserVerified(viewerRow?.is_verified === true || viewerRow?.verification_status === "verified");
    setSenderNames(Object.fromEntries(Object.values(profileMap).map((profile) => [profile.id, profile.displayName])));
    if (roomRow.type !== "group") {
      const otherId = hintUserId && hintUserId !== userId ? hintUserId : memberRows.find((member) => member.userId !== userId)?.userId;
      setCounterpart(otherId ? profileMap[otherId] ?? null : null);
      if (otherId) {
        const [blocks, unmatches] = await Promise.all([
          supabase.from("user_blocks").select("blocker_id,blocked_id").or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${userId})`).limit(1),
          supabase.from("user_unmatches").select("actor_id,target_id").or(`and(actor_id.eq.${otherId},target_id.eq.${userId}),and(actor_id.eq.${userId},target_id.eq.${otherId})`).limit(1),
        ]);
        if ((blocks.data?.length ?? 0) > 0 || (unmatches.data?.length ?? 0) > 0) {
          throw new Error("direct_relationship_unavailable");
        }
      }
    } else {
      const { data: memberState } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_native_group_member_state", {
        p_chat_id: targetRoomId,
      });
      const row = Array.isArray(memberState) ? memberState[0] as { is_muted?: boolean; role?: string } | undefined : null;
      setGroupMuted(row?.is_muted === true);
      setIsAdmin(roomRow.createdBy === userId || String(row?.role || "").toLowerCase() === "admin");
      setGroupOwner(roomRow.createdBy ? profileMap[roomRow.createdBy] ?? null : null);
    }
    const rows = await fetchNativeChatMessages({ roomId: targetRoomId, limit: INITIAL_MESSAGE_LOAD_SIZE + 1 });
    setHasOlder(rows.length > INITIAL_MESSAGE_LOAD_SIZE);
    await hydrateMessages(rows.slice(-INITIAL_MESSAGE_LOAD_SIZE));
    void markNativeChatRoomRead({ roomId: targetRoomId, userId });
    setLoadedRoomId(targetRoomId);
  }, [hydrateMessages, userId]);

  const resolveMatchedFallbackTarget = useCallback(async (targetRoomId: string) => {
    if (!userId) return null;
    const { data } = await supabase
      .from("matches")
      .select("user1_id,user2_id")
      .eq("chat_id", targetRoomId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const row = data as { user1_id?: string | null; user2_id?: string | null } | null;
    const fallback = row?.user1_id === userId ? row.user2_id : row?.user1_id;
    return fallback && fallback !== userId ? fallback : null;
  }, [userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadedRoomId(null);
    setLoadError(false);
    setNotice(null);
    setRoom(null);
	    messagesRef.current = [];
	    setMessages([]);
    setSenderNames({});
    setCounterpart(null);
    setGroupOwner(null);
    setMemberCount(0);
    setIsAdmin(false);
    setGroupMuted(false);
    setBlockState("none");
    setUnmatchState("none");
    setReadMessageIds(new Set());
    setAttachmentUrls({});
    setLinkPreviews({});
    setInput("");
    setUploads([]);
    setHasOlder(false);
    setShowLatest(false);
    void (async () => {
      try {
        if (!userId) {
          onNavigate("/auth");
          return;
        }
        setChatDisabledBySafety(await isNativeRestrictionActive("chat_disabled"));
        let targetRoomId = params.room;
        if (!targetRoomId && params.withUserId) {
          targetRoomId = await ensureNativeDirectChatRoom(params.withUserId, params.name || "Conversation");
          if (active) setRoomId(targetRoomId);
        }
        if (!targetRoomId) throw new Error("missing_room");
        if (!active) return;
        setRoomId(targetRoomId);
        try {
          await loadRoom(targetRoomId, params.withUserId);
        } catch (error) {
          if (!params.room) throw error;
          const hintedRoom = await fetchNativeChatRoom(params.room);
          if (hintedRoom?.type === "group" || hintedRoom?.type === "service") throw error;
          const fallbackTargetId = params.withUserId || await resolveMatchedFallbackTarget(params.room);
          if (!fallbackTargetId) throw error;
          const fallbackRoomId = await ensureNativeDirectChatRoom(fallbackTargetId, params.name || "Conversation");
          if (!active) return;
          setRoomId(fallbackRoomId);
          await loadRoom(fallbackRoomId, fallbackTargetId);
        }
      } catch {
        if (active) {
          setLoadError(true);
          onNavigate("/chats?tab=chats");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadRoom, loadRetryKey, onNavigate, params.name, params.room, params.withUserId, resolveMatchedFallbackTarget, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const messageHandle = ensureSingleRealtimeChannel(`native-chat-dialogue-messages:${roomId}`, () =>
      supabase.channel(`native-chat-dialogue-messages:${roomId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as { id?: string; chat_id?: string; sender_id?: string; content?: string; created_at?: string } | null;
        if (!row?.id || row.chat_id !== roomId) return;
        if (__DEV__) console.debug("[native.chat] realtime_message", { messageId: row.id, roomId });
        const mapped: NativeChatMessage = { id: row.id, chatId: roomId, senderId: String(row.sender_id || ""), content: String(row.content || ""), createdAt: String(row.created_at || "") };
	          setMessages((current) => {
	            if (current.some((message) => message.id === mapped.id)) return current;
	            const next = [...current, mapped].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
	            messagesRef.current = next;
	            void resolveAttachmentUrls(next).then(setAttachmentUrls);
	            queueReads([mapped]);
	            if (nearBottomRef.current) {
	              setTimeout(() => {
	                scrollRef.current?.scrollToEnd({ animated: true });
	                markCurrentRoomSeen(roomId, mapped.createdAt);
	              }, 80);
              setShowLatest(false);
            } else {
              setShowLatest(true);
            }
            return next;
          });
      }),
    );
    const readsHandle = ensureSingleRealtimeChannel(`native-chat-dialogue-reads:${roomId}`, () =>
      supabase.channel(`native-chat-dialogue-reads:${roomId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: `chat_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as { message_id?: string; user_id?: string } | null;
        if (!row?.message_id || row.user_id === userId) return;
		        const sentIds = new Set(messagesRef.current.filter((message) => message.senderId === userId).map((message) => message.id));
        if (!sentIds.has(row.message_id)) return;
        setReadMessageIds((current) => new Set([...current, row.message_id!]));
      }),
    );
    const membersHandle = ensureSingleRealtimeChannel(`native-chat-dialogue-members:${roomId}`, () =>
      supabase.channel(`native-chat-dialogue-members:${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members", filter: `chat_id=eq.${roomId}` }, (payload) => {
        if (__DEV__) console.debug("[native.chat] realtime_members", { event: payload.eventType, roomId });
        void refreshMembershipSnapshot(roomId);
      }),
    );
    return () => {
      void messageHandle.dispose();
      void readsHandle.dispose();
      void membersHandle.dispose();
      void flushReads();
    };
	  }, [flushReads, markCurrentRoomSeen, queueReads, refreshMembershipSnapshot, roomId, userId]);

  useEffect(() => {
    if (!activePreviewUrl || linkPreviews[activePreviewUrl]) return;
    if (linkPreviewRequestsRef.current.has(activePreviewUrl)) return;
    linkPreviewRequestsRef.current.add(activePreviewUrl);
    void fetchNativeSocialLinkPreviews([activePreviewUrl]).then((next) => {
      if (Object.keys(next).length > 0) setLinkPreviews((current) => ({ ...current, ...next }));
    });
  }, [activePreviewUrl, linkPreviews]);

  useEffect(() => {
    if (!typedPreviewUrl || dismissedPreviewUrls.has(typedPreviewUrl)) return;
    const preview = linkPreviews[typedPreviewUrl];
    if (!preview || "failed" in preview && preview.failed) return;
    setLockedPreviewUrl(typedPreviewUrl);
    setInput((current) => current.includes(typedPreviewUrl) ? stripUrl(current, typedPreviewUrl) : current);
  }, [dismissedPreviewUrls, linkPreviews, typedPreviewUrl]);

  const loadOlder = useCallback(async () => {
    if (!roomId || loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const rows = await fetchNativeChatMessages({ roomId, beforeCreatedAt: messages[0].createdAt, limit: OLDER_MESSAGE_PAGE_SIZE + 1 });
      setHasOlder(rows.length > OLDER_MESSAGE_PAGE_SIZE);
      const older = rows.slice(0, OLDER_MESSAGE_PAGE_SIZE);
      const next = [...older, ...messages];
      await hydrateMessages(next, { scrollToLatest: false });
    } catch {
      setNotice("Unable to load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, hydrateMessages, loadingOlder, messages, roomId]);

  const pickMedia = useCallback(async () => {
    if (composerDisabled) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: canSendVideo ? ["images", "videos"] : ["images"],
      orderedSelection: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
      selectionLimit: 10 - uploads.length,
    });
    if (result.canceled) return;
    const selected = result.assets.map((asset, index) => ({
      height: asset.height,
      uri: asset.uri,
      name: asset.fileName || `media-${Date.now()}-${index}`,
      mime: asset.mimeType || "application/octet-stream",
      size: asset.fileSize ?? null,
      status: "queued" as const,
      width: asset.width,
    }));
    if (!canSendVideo && selected.some((asset) => asset.mime.startsWith("video/"))) {
      setNotice("Video upload is for Gold members only.");
    }
    setUploads((current) => [
      ...current,
      ...selected.filter((asset) => canSendVideo || !asset.mime.startsWith("video/")),
    ].slice(0, 10));
  }, [canSendVideo, composerDisabled, uploads.length]);

  const submitMessage = useCallback(async () => {
    if (!roomId || !userId || composerDisabled) return;
    const text = input.trim();
    const media = uploads;
    const previewUrl = activePreviewUrl;
    if (!text && media.length === 0 && !previewUrl) return;
    if (!canSendVideo && media.some((item) => item.mime.startsWith("video/"))) {
      setUploads((current) => current.filter((item) => !item.mime.startsWith("video/")));
      setNotice("Video upload is for Gold members only.");
      return;
    }
    setSending(true);
    const previousText = input;
    const previousUploads = uploads;
    const previousPreviewUrl = lockedPreviewUrl;
    try {
      const uploaded = [];
      for (const item of media) {
        setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, status: "uploading" } : entry));
        const response = await fetch(item.uri);
        const blob = await response.blob();
        const attachment = await uploadNativeChatAttachment({ userId, roomId, fileName: item.name, mime: item.mime, body: blob, size: item.size });
        setUploads((current) => current.map((entry) => entry.uri === item.uri ? { ...entry, status: "uploaded" } : entry));
        uploaded.push(attachment);
      }
      const payload = JSON.stringify({ text: previewUrl ? stripUrl(text, previewUrl) : text, attachments: uploaded, linkPreviewUrl: previewUrl });
      const sent = await sendNativeChatMessage({ roomId, senderId: userId, content: payload });
      setInput("");
      setUploads([]);
      setLockedPreviewUrl(null);
      setDismissedPreviewUrls(new Set());
      await hydrateMessages([...messages.filter((message) => message.id !== sent.id), sent].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      haptic.success();
    } catch {
      setInput(previousText);
      setUploads(previousUploads.map((item) => ({ ...item, status: "error" })));
      setLockedPreviewUrl(previousPreviewUrl);
      setNotice("Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [activePreviewUrl, canSendVideo, composerDisabled, hydrateMessages, input, lockedPreviewUrl, messages, roomId, uploads, userId]);

  const toggleBlock = useCallback(async () => {
    if (!counterpart?.id) return;
    try {
      const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(fn, { p_blocked_id: counterpart.id });
      if (error) throw error;
      setBlockState(blockState === "blocked_by_me" ? "none" : "blocked_by_me");
    } catch {
      setNotice("Unable to update block status right now.");
    } finally {
      setConfirmBlockOpen(false);
    }
  }, [blockState, counterpart?.id]);

  const blockGroupMember = useCallback(async () => {
    if (!groupMemberBlockTarget || groupMemberBlockTarget.id === userId) return;
    try {
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("block_user", { p_blocked_id: groupMemberBlockTarget.id });
      if (error) throw error;
      setNotice(`${groupMemberBlockTarget.name} blocked.`);
    } catch {
      setNotice("Unable to block this member right now.");
    } finally {
      setGroupMemberBlockTarget(null);
    }
  }, [groupMemberBlockTarget, userId]);

  const unmatch = useCallback(async () => {
    if (!counterpart?.id) return;
    try {
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("unmatch_user_one_sided", { p_other_user_id: counterpart.id });
      if (error) throw error;
      onNavigate("/chats?tab=chats");
    } catch {
      setNotice("Unable to unmatch right now.");
    } finally {
      setConfirmUnmatchOpen(false);
    }
  }, [counterpart?.id, onNavigate]);

  const toggleMute = useCallback(async () => {
    if (!roomId || !userId) return;
    const next = !groupMuted;
    setGroupMuted(next);
    try {
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("set_group_mute_state", {
        p_chat_id: roomId,
        p_muted: next,
      });
      if (error) throw error;
    } catch {
      setGroupMuted(!next);
      setNotice("Unable to update notifications right now.");
    }
  }, [groupMuted, roomId, userId]);

  const loadGroupManageData = useCallback(async () => {
    if (!roomId || !userId) return;
    setGroupManageLoading(true);
    try {
      const { data: memberRows, error: memberError } = await supabase
        .from("chat_room_members")
        .select("user_id")
        .eq("chat_id", roomId)
        .limit(100);
      if (memberError) throw memberError;
      const memberIds = (memberRows || []).map((row) => String((row as { user_id?: string }).user_id || "")).filter(Boolean);
      const profileMap = await fetchProfiles(memberIds);
      const members = memberIds.map((id) => ({
        id,
        name: profileMap[id]?.displayName || "User",
        avatarUrl: profileMap[id]?.avatarUrl || null,
        socialId: profileMap[id]?.socialId || null,
        isVerified: profileMap[id]?.isVerified === true,
      }));
      setGroupManageMembers(members);

      const memberSet = new Set(memberIds);
      const addable = new Set<string>();
      const { data: matchRows } = await supabase
        .from("matches")
        .select("user1_id,user2_id")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq("is_active", true)
        .limit(200);
      (matchRows || []).forEach((row) => {
        const item = row as { user1_id?: string; user2_id?: string };
        const peer = item.user1_id === userId ? item.user2_id : item.user1_id;
        if (peer && !memberSet.has(peer)) addable.add(peer);
      });

      const { data: myRooms } = await supabase.from("chat_room_members").select("chat_id").eq("user_id", userId).limit(200);
      const myRoomIds = (myRooms || []).map((row) => String((row as { chat_id?: string }).chat_id || "")).filter(Boolean);
      if (myRoomIds.length > 0) {
        const { data: directRooms } = await supabase.from("chats").select("id").in("id", myRoomIds).eq("type", "direct").limit(myRoomIds.length);
        const directRoomIds = (directRooms || []).map((row) => String((row as { id?: string }).id || "")).filter(Boolean);
        if (directRoomIds.length > 0) {
          const { data: peerRows } = await supabase.from("chat_room_members").select("user_id").in("chat_id", directRoomIds).neq("user_id", userId).limit(directRoomIds.length * 2);
          (peerRows || []).forEach((row) => {
            const peer = String((row as { user_id?: string }).user_id || "");
            if (peer && !memberSet.has(peer)) addable.add(peer);
          });
        }
      }

      const candidateIds = [...addable];
      if (candidateIds.length > 0) {
        const [blockRows, unmatchRows] = await Promise.all([
          supabase
            .from("user_blocks")
            .select("blocker_id,blocked_id")
            .or(`and(blocker_id.eq.${userId},blocked_id.in.(${candidateIds.join(",")})),and(blocked_id.eq.${userId},blocker_id.in.(${candidateIds.join(",")}))`),
          supabase
            .from("user_unmatches")
            .select("actor_id,target_id")
            .or(`and(actor_id.eq.${userId},target_id.in.(${candidateIds.join(",")})),and(target_id.eq.${userId},actor_id.in.(${candidateIds.join(",")}))`),
        ]);
        (blockRows.data || []).forEach((row) => {
          const block = row as { blocker_id?: string | null; blocked_id?: string | null };
          addable.delete(block.blocker_id === userId ? String(block.blocked_id || "") : String(block.blocker_id || ""));
        });
        (unmatchRows.data || []).forEach((row) => {
          const unmatch = row as { actor_id?: string | null; target_id?: string | null };
          addable.delete(unmatch.actor_id === userId ? String(unmatch.target_id || "") : String(unmatch.actor_id || ""));
        });
      }

      const friendProfileMap = await fetchProfiles([...addable]);
      setGroupManageFriends([...addable].map((id) => ({
        id,
        name: friendProfileMap[id]?.displayName || "User",
        avatarUrl: friendProfileMap[id]?.avatarUrl || null,
        socialId: friendProfileMap[id]?.socialId || null,
        isVerified: friendProfileMap[id]?.isVerified === true,
      })));
    } catch {
      setNotice("Couldn't load group members.");
    } finally {
      setGroupManageLoading(false);
    }
  }, [roomId, userId]);

  const openGroupInfoSheet = useCallback(() => {
    setGroupDescriptionDraft(room?.description || "");
    setGroupNameDraft(title);
    setGroupInfoOpen(true);
    void loadGroupManageData();
  }, [loadGroupManageData, room?.description, title]);

  const saveGroupName = useCallback(async () => {
    if (!roomId || !isAdmin) return;
    if (!groupNameEditing) {
      setGroupNameDraft(title);
      setGroupNameEditing(true);
      return;
    }
    const nextName = groupNameDraft.trim();
    if (!nextName) {
      setNotice("Group name is required.");
      return;
    }
    setGroupNameSaving(true);
    try {
      const row = await updateNativeGroupChatMetadata({
        roomId,
        name: nextName,
        updateName: true,
      });
      setRoom((current) => current ? { ...current, name: row?.name ?? nextName } : current);
      setGroupNameDraft(row?.name ?? nextName);
      setGroupNameEditing(false);
      setNotice("Group name updated.");
    } catch {
      setNotice("Couldn't save group name.");
    } finally {
      setGroupNameSaving(false);
    }
  }, [groupNameDraft, groupNameEditing, isAdmin, roomId, title]);

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
      });
      setRoom((current) => current ? { ...current, description: row?.description ?? (groupDescriptionDraft.trim() || null) } : current);
      setGroupDescriptionEditing(false);
      setNotice("Group description updated.");
    } catch {
      setNotice("Couldn't save group description.");
    } finally {
      setGroupDescriptionSaving(false);
    }
  }, [groupDescriptionDraft, groupDescriptionEditing, roomId]);

  const updateGroupAvatar = useCallback(async () => {
    if (!roomId || !userId || !isAdmin || groupAvatarBusy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
    });
    if (result.canceled || !result.assets[0]) return;
    setGroupAvatarBusy("upload");
    try {
      const asset = result.assets[0];
      const compressed = await manipulateAsync(asset.uri, [{ resize: { width: 1280 } }], {
        compress: 0.6,
        format: SaveFormat.JPEG,
      });
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const path = `${userId}/groups/${roomId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const avatarUrl = resolveNativeAvatarUrl(path);
      if (!avatarUrl) throw new Error("missing_public_url");
      const row = await updateNativeGroupChatMetadata({ roomId, avatarUrl, updateAvatar: true });
      setRoom((current) => current ? { ...current, avatarUrl: row?.avatarUrl ?? avatarUrl } : current);
      setNotice("Cover updated.");
    } catch {
      setNotice("Couldn't update cover. Try again.");
    } finally {
      setGroupAvatarBusy(null);
    }
  }, [groupAvatarBusy, isAdmin, roomId, userId]);

  const inviteGroupMember = useCallback(async (member: GroupManageMember) => {
    if (!roomId || !userId) return;
    if (!currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      const inviterName = senderNames[userId] || "Someone";
      const { error } = await supabase.from("group_chat_invites").upsert({
        chat_id: roomId,
        chat_name: title,
        inviter_user_id: userId,
        invitee_user_id: member.id,
        status: "pending",
      }, { onConflict: "chat_id,invitee_user_id", ignoreDuplicates: false });
      if (error) throw error;
      setGroupManageFriends((current) => current.filter((item) => item.id !== member.id));
      void (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>)("enqueue_notification", {
        p_user_id: member.id,
        p_category: "chats",
        p_kind: "group_invite",
        p_title: "Group invite",
        p_body: `${inviterName} added you to a group 🐾`,
        p_href: `/chat-dialogue?room=${roomId}&name=${encodeURIComponent(title)}&joined=1`,
        p_data: { chat_id: roomId, chat_name: title, inviter_name: inviterName },
      });
      setNotice(`${member.name} invited.`);
    } catch {
      setNotice("Couldn't add member.");
    }
  }, [currentUserVerified, roomId, senderNames, title, userId]);

  const removeGroupMember = useCallback(async (member: GroupManageMember) => {
    if (!roomId) return;
    if (!currentUserVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    try {
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("remove_group_member", {
        p_chat_id: roomId,
        p_user_id: member.id,
      });
      if (error) throw error;
      setGroupManageMembers((current) => current.filter((item) => item.id !== member.id));
      setMemberCount((current) => Math.max(0, current - 1));
      setNotice(`${member.name} removed.`);
    } catch {
      setNotice("Couldn't remove member.");
    }
  }, [currentUserVerified, roomId]);

  const removeGroup = useCallback(async () => {
    if (!roomId) return;
    try {
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("remove_group_chat", {
        p_chat_id: roomId,
      });
      if (error) throw error;
      onNavigate("/chats?tab=groups");
    } catch {
      setNotice("Unable to remove group right now.");
    } finally {
      setConfirmRemoveGroupOpen(false);
    }
  }, [onNavigate, roomId]);

  const leaveGroup = useCallback(async () => {
    if (!roomId || !userId) return;
    try {
      await sendNativeChatMessage({ roomId, senderId: userId, content: `${senderNames[userId] || "Someone"} left the group.` });
      const { error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("remove_native_group_member", {
        p_chat_id: roomId,
        p_user_id: userId,
      });
      if (error) throw error;
      onNavigate("/chats?tab=groups");
    } catch {
      setNotice("Unable to leave group right now.");
    }
  }, [onNavigate, roomId, senderNames, userId]);

  const deleteAttachment = useCallback(async (message: NativeChatMessage, attachmentPath: string) => {
    if (!userId || message.senderId !== userId) return;
    try {
      await deleteOwnNativeChatAttachment({ userId, path: attachmentPath });
      const parsed = parseMessageContent(message.content);
      const remaining = parsed.attachments.filter((item) => item.path !== attachmentPath);
      const content = JSON.stringify({
        text: parsed.text,
        attachments: remaining,
        linkPreviewUrl: parsed.linkPreviewUrl,
        kind: parsed.kind,
      });
      const { data, error } = await supabase
        .from("chat_messages")
        .update({ content })
        .eq("id", message.id)
        .eq("sender_id", userId)
        .select("id,chat_id,sender_id,content,created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const updated: NativeChatMessage = {
          id: String((data as { id?: string }).id || message.id),
          chatId: String((data as { chat_id?: string }).chat_id || message.chatId),
          senderId: String((data as { sender_id?: string }).sender_id || message.senderId),
          content: String((data as { content?: string }).content || content),
          createdAt: String((data as { created_at?: string }).created_at || message.createdAt),
        };
        await hydrateMessages(messages.map((item) => item.id === message.id ? updated : item));
      }
      setNotice("Attachment removed.");
    } catch {
      setNotice("Unable to remove attachment right now.");
    }
  }, [hydrateMessages, messages, userId]);

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
  }, [groupInfoOpen, groupNameEditing, title]);

  const renderLinkPreview = (url: string | null, removable = false) => {
    if (!url) return null;
    return (
      <View style={removable ? nativeModalStyles.appModalInlineCardWrap : undefined}>
        <NativeSocialExternalLinkPreview
          linkPreview={linkPreviews[url] || null}
          onOpen={(nextUrl) => void Linking.openURL(nextUrl)}
          url={url}
        />
        {removable ? (
          <Pressable accessibilityLabel="Remove link preview" onPress={() => {
            setDismissedPreviewUrls((current) => new Set([...current, url]));
            setLockedPreviewUrl((current) => current === url ? null : current);
          }} style={nativeModalStyles.appModalInlineCardClose}>
            <Feather color={huddleColors.iconMuted} name="x" size={14} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const openMediaPreview = (uri: string | null | undefined) => {
    if (!uri) return;
    setMediaPreviewUri(uri);
  };

  const renderMessage = (message: NativeChatMessage, index: number) => {
    const mine = message.senderId === userId;
    const parsed = parseMessageContent(message.content);
    const text = parsed.text.trim();
    const isMembershipHint = isGroup && parsed.kind !== "system" && parsed.attachments.length === 0 && text.length > 0 && (parsed.kind === "membership" || /just joined the chat\.$|has joined the group!$|left the group\.$/i.test(text));
    const isSystem = parsed.kind === "system";
    const isStarIntro = !isGroup && isStarIntroKind(parsed.kind);
    const isStarFirstUserMessage = !isGroup && firstStarUserMessageId === message.id;
    const previous = index > 0 ? messages[index - 1] : null;
    const divider = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
      ? formatDividerLabel(message.createdAt)
      : "";
    if (isSystem) {
      return (
        <View key={message.id}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          {isGroup && room?.roomCode && text.startsWith(`Room Code: ${room.roomCode}`) ? null : <Text style={styles.systemPill}>{text}</Text>}
        </View>
      );
    }
    if (isMembershipHint) {
      return (
        <View key={message.id}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          <Text style={styles.membershipPill}>{text}</Text>
        </View>
      );
    }
    const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
    const displayText = previewUrl ? stripUrl(parsed.text, previewUrl) : parsed.text;
    if (parsed.share) {
      return (
        <View key={message.id}>
          {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
          {isGroup && !mine ? <Text style={styles.senderName}>{senderNames[message.senderId] || ""}</Text> : null}
          <View style={[styles.messageRow, mine && styles.messageRowMine]}>
            <Pressable
              accessibilityRole={parsed.share.imageUrl ? "imagebutton" : "button"}
              disabled={!parsed.share.imageUrl}
              onPress={() => {
                openMediaPreview(parsed.share?.imageUrl);
              }}
              style={[nativeModalStyles.appModalShareCard, mine ? nativeModalStyles.appModalShareCardMine : null]}
            >
              <View style={nativeModalStyles.appModalShareCardBody}>
                <View style={styles.shareThumb}>{parsed.share.imageUrl ? <Image resizeMode="contain" source={{ uri: parsed.share.imageUrl }} style={styles.shareThumbImage} /> : null}</View>
                <View style={styles.shareTextWrap}>
                  <Text numberOfLines={2} style={styles.shareTitle}>{buildShareHeadline(parsed.share)}</Text>
                  {parsed.share.description ? <Text numberOfLines={2} style={styles.shareDescription}>{parsed.share.description}</Text> : null}
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View key={message.id}>
        {divider ? <Text style={styles.dayDivider}>{divider}</Text> : null}
        {isGroup && !mine ? <Text style={styles.senderName}>{senderNames[message.senderId] || ""}</Text> : null}
        <View style={[styles.messageRow, mine && styles.messageRowMine]}>
          <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs, isStarIntro || isStarFirstUserMessage ? styles.messageBubbleStar : null, !mine && !(isStarIntro || isStarFirstUserMessage) ? styles.messageBubbleCounterpart : null]}>
            {isStarIntro ? (
              <Text style={styles.starText}>{mine ? "You sent a Star ⭐" : "New Star Connection ⭐"}</Text>
            ) : null}
            {!isStarIntro && parsed.attachments.length > 0 ? (
              <View style={styles.attachmentGrid}>
                {parsed.attachments.map((attachment, attachmentIndex) => {
                  const uri = attachment.url || (attachment.path ? attachmentUrls[attachment.path] : null);
                  const isImage = attachment.mime.startsWith("image/");
                  return (
                    <Pressable
                      key={`${message.id}:${attachmentIndex}`}
                      accessibilityRole={isImage ? "imagebutton" : "button"}
                      disabled={!uri || !isImage}
                      onPress={() => openMediaPreview(uri)}
                      style={styles.attachmentPreview}
                    >
                      {uri && isImage ? <Image accessibilityLabel="native-chat-attachment-tile" testID="native-chat-attachment-tile" source={{ uri }} style={styles.attachmentImage} /> : uri && attachment.mime.startsWith("video/") ? <NativeAttachmentVideo uri={uri} /> : <Feather color={mine ? huddleColors.onPrimary : huddleColors.blue} name={attachment.mime.startsWith("video/") ? "video" : "paperclip"} size={22} />}
                      {mine && attachment.path ? <Pressable accessibilityLabel="Delete attachment" onPress={() => void deleteAttachment(message, attachment.path!)} style={styles.removeUpload}><Feather color={huddleColors.onPrimary} name="x" size={12} /></Pressable> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {!isStarIntro ? renderLinkPreview(previewUrl) : null}
            {!isStarIntro && displayText ? <Text style={[styles.messageText, mine && styles.messageTextMine, isStarFirstUserMessage ? styles.starText : null]}>{displayText}</Text> : null}
          </View>
        </View>
        <View style={[styles.messageMeta, mine && styles.messageMetaMine]}>
          <Text style={styles.messageTime}>{formatMessageTime(message.createdAt)}</Text>
          {mine ? <Text style={[styles.readMark, readMessageIds.has(message.id) && styles.readMarkSeen]}>{readMessageIds.has(message.id) ? "✓✓" : "✓"}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0} style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => onNavigate(isGroup ? "/chats?tab=groups" : "/chats?tab=chats")} style={styles.iconButton}><Feather color={huddleColors.text} name="arrow-left" size={20} /></Pressable>
        {!headerReady ? (
          <View style={styles.identity} pointerEvents="none">
            <View style={[styles.avatar, styles.headerSkeletonAvatar]} />
            <View style={styles.identityText}>
              <View style={styles.headerSkeletonTitle} />
              <View style={styles.headerSkeletonSubtitle} />
            </View>
          </View>
        ) : isGroup ? (
          <Pressable accessibilityLabel="Open group details" onPress={openGroupInfoSheet} style={styles.identity}>
            <View style={styles.avatar}><ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={20} />} style={styles.avatarImage} uri={room?.avatarUrl} /></View>
            <View style={styles.identityText}><Text numberOfLines={1} style={styles.title}>{title}</Text><Text numberOfLines={1} style={styles.subtitle}>{memberCountLabel}</Text></View>
          </Pressable>
        ) : (
          <Pressable disabled={counterpart?.isTeamHuddle === true} onPress={() => counterpart?.id && setProfileSheetUserId(counterpart.id)} style={styles.identity}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, counterpart?.isVerified ? styles.avatarVerified : null]}>{counterpart?.isTeamHuddle ? <Image source={teamHuddleLogo} style={styles.avatarImage} /> : <ResilientAvatarImage fallback={<Image accessibilityLabel={title} resizeMode="cover" source={profilePlaceholder} style={styles.avatarImage} />} style={styles.avatarImage} uri={counterpart?.avatarUrl} />}</View>
              <VerifiedAvatarBadge active={counterpart?.isVerified === true} />
            </View>
            <View style={styles.identityText}>
              <View style={styles.titleRow}><Text numberOfLines={1} style={styles.title}>{title}</Text>{counterpart?.socialId && !counterpart?.isTeamHuddle ? <Text numberOfLines={1} style={styles.subtitle}>@{counterpart.socialId}</Text> : null}</View>
              <Text numberOfLines={1} style={styles.subtitle}>{counterpart?.availability || "Pet Parent"}</Text>
            </View>
          </Pressable>
        )}
        {headerReady && (!counterpart?.isTeamHuddle || isGroup) ? <Pressable accessibilityLabel={isGroup ? "native-chat-group-details-button" : "native-chat-more-button"} testID={isGroup ? "native-chat-group-details-button" : "native-chat-more-button"} onPress={() => setMenuOpen(true)} style={styles.iconButton}><Feather color={huddleColors.iconMuted} name="more-horizontal" size={20} /></Pressable> : <View style={styles.iconButton} />}
      </View>
      {notice ? <View style={styles.notice}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
      {loading ? <NativeLoadingState /> : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (nearBottomRef.current) {
              scrollRef.current?.scrollToEnd({ animated: false });
              markCurrentRoomSeen();
            }
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
          {isGroup && room?.visibility === "private" && room.roomCode ? <Text style={styles.roomCode}>Room Code: {room.roomCode}</Text> : null}
          {loadingOlder ? <NativeLoadingState variant="inline" /> : null}
          {blockState === "blocked_by_me" ? <Text style={styles.systemPill}>You've blocked {counterpart?.displayName || "this user"}</Text> : null}
          {blockState === "blocked_by_them" ? <Text style={styles.systemPill}>You're blocked by {counterpart?.displayName || "user"}.</Text> : null}
          {unmatchState !== "none" ? <Text style={styles.systemPill}>{unmatchState === "unmatched_by_me" ? "You've unmatched this user." : "You've been unmatched."}</Text> : null}
          {!isGroup && latestStarIntro ? <Text style={styles.starPill}>{latestStarIntro.senderId === userId ? "Star sent! You've jumped to the front of the line." : `${counterpart?.displayName || "Someone"} used a Star to reach you. Say hi!`}</Text> : null}
          {messages.map(renderMessage)}
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
      <View style={[nativeModalStyles.appModalComposerSurface, { paddingBottom: insets.bottom + huddleSpacing.x4 }]}>
        {activePreviewUrl ? renderLinkPreview(activePreviewUrl, true) : null}
        {uploads.length > 0 ? (
          <ScrollView bounces={false} directionalLockEnabled horizontal keyboardShouldPersistTaps="handled" nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uploadRail}>
            {uploads.map((item, index) => (
              <View key={`${item.uri}:${index}`} style={styles.uploadThumb}>
                {item.mime.startsWith("image/") ? <Image resizeMode="cover" source={{ uri: item.uri }} style={styles.uploadImage} /> : <View style={styles.uploadVideoThumb}><Feather color={huddleColors.onPrimary} name="play" size={22} /></View>}
                {item.status === "uploading" ? (
                  <View pointerEvents="none" style={styles.uploadingOverlay}>
                    <ActivityIndicator color={huddleColors.onPrimary} size="small" />
                    <Text style={styles.uploadingText}>Uploading {uploadProgress ?? 0}%</Text>
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
              <Pressable accessibilityLabel={canSendVideo ? "Add media" : "Add images"} disabled={composerDisabled} onPress={pickMedia} style={styles.attachButton}><Feather color={huddleColors.mutedText} name="image" size={16} /></Pressable>
              <AppModalField accessibilityLabel="native-chat-composer-input" testID="native-chat-composer-input" editable={!composerDisabled} focused={composerFocused} multiline onBlur={() => setComposerFocused(false)} onChangeText={setInput} onFocus={() => setComposerFocused(true)} placeholder="" style={nativeModalStyles.appModalComposerInput} value={input} />
            </View>
            <Pressable accessibilityLabel="native-chat-send-button" testID="native-chat-send-button" disabled={composerDisabled || (!input.trim() && uploads.length === 0 && !activePreviewUrl)} onPress={() => submitMessage()} style={[styles.sendButton, (composerDisabled || (!input.trim() && uploads.length === 0 && !activePreviewUrl)) && huddleButtons.disabled]}>
              {sending ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Feather color={huddleColors.onPrimary} name="send" size={17} />}
            </Pressable>
          </View>
        )}
      </View>
      <Modal presentationStyle="overFullScreen" transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setMenuOpen(false)}>
          <AppActionMenu items={isGroup ? [
            { label: "Group info", icon: "info", onPress: () => { setMenuOpen(false); openGroupInfoSheet(); } },
            { label: groupMuted ? "Notifications on" : "Mute group", icon: groupMuted ? "bell" : "bell-off", onPress: () => { setMenuOpen(false); void toggleMute(); } },
            { label: "Report group", icon: "flag", onPress: () => { setMenuOpen(false); setReportOpen(true); } },
            { label: isAdmin ? "Remove group" : "Leave group", icon: "log-out", destructive: true, onPress: () => { setMenuOpen(false); if (isAdmin) setConfirmRemoveGroupOpen(true); else setConfirmLeaveOpen(true); } },
          ] : [
            { label: "Report User", icon: "flag", onPress: () => { setMenuOpen(false); setReportOpen(true); } },
            { label: blockState === "blocked_by_me" ? "Unblock User" : "Block User", icon: "slash", onPress: () => { setMenuOpen(false); setConfirmBlockOpen(true); } },
            { label: "Unmatch", icon: "user-x", destructive: true, onPress: () => { setMenuOpen(false); setConfirmUnmatchOpen(true); } },
          ]} />
        </Pressable>
      </Modal>
      <Modal presentationStyle="overFullScreen" transparent visible={Boolean(mediaPreviewUri)} animationType="fade" onRequestClose={() => setMediaPreviewUri(null)}>
        <Pressable accessibilityLabel="Close media preview" style={styles.mediaPreviewBackdrop} onPress={() => setMediaPreviewUri(null)}>
          {mediaPreviewUri ? <Image resizeMode="contain" source={{ uri: mediaPreviewUri }} style={styles.mediaPreviewImage} /> : null}
        </Pressable>
      </Modal>
      <Modal presentationStyle="overFullScreen" transparent visible={groupInfoOpen} animationType="slide" onRequestClose={() => setGroupInfoOpen(false)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setGroupInfoOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
            <AppBottomSheet mode="autoMax">
              <AppBottomSheetHeader>
                <View style={styles.groupInfoHeaderIdentity}>
                  <Pressable accessibilityLabel="Change group avatar" disabled={!isAdmin || groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={styles.groupInfoHeaderAvatar}>
                    {room?.avatarUrl ? (
                      <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={24} />} style={styles.groupInfoHeaderAvatarImage} uri={room.avatarUrl} />
                    ) : (
                      <Feather color={huddleColors.blue} name="users" size={24} />
                    )}
                  </Pressable>
                  <View style={styles.groupInfoHeaderTitleWrap}>
                    {groupNameEditing ? (
                      <AppModalField
                        accessibilityLabel="Group name"
                        editable={!groupNameSaving}
                        onChangeText={setGroupNameDraft}
                        placeholder="Group name"
                        style={styles.groupInfoNameField}
                        value={groupNameDraft}
                      />
                    ) : (
                      <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>{title}</Text>
                    )}
                  </View>
                  {isAdmin ? (
                    <Pressable accessibilityLabel={groupNameEditing ? "Save group name" : "Edit group name"} disabled={groupNameSaving} onPress={saveGroupName} style={styles.groupInfoNameButton}>
                      {groupNameSaving ? <ActivityIndicator color={huddleColors.blue} size="small" /> : <Feather color={huddleColors.blue} name={groupNameEditing ? "check" : "edit-2"} size={17} />}
                    </Pressable>
                  ) : null}
                </View>
                {isAdmin ? (
                  <Pressable accessibilityLabel={room?.avatarUrl ? "Change group avatar" : "Add group avatar"} disabled={groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={nativeModalStyles.appModalCompactSecondaryButton}>
                    <Text style={styles.compactButtonText}>{groupAvatarBusy === "upload" ? "Updating..." : "Change avatar"}</Text>
                  </Pressable>
                ) : null}
                <AppModalIconButton accessibilityLabel="Close group details" onPress={() => setGroupInfoOpen(false)}>
                  <Feather color={huddleColors.text} name="x" size={22} />
                </AppModalIconButton>
              </AppBottomSheetHeader>
              <AppBottomSheetScroll>
                <View style={styles.groupInfoSheetBody}>
                  <View style={nativeModalStyles.appGroupHero}>
                    {room?.avatarUrl ? <ResilientAvatarImage fallback={<View style={nativeModalStyles.appGroupHeroFallback} />} style={nativeModalStyles.appGroupHeroImage} uri={room.avatarUrl} /> : <View style={nativeModalStyles.appGroupHeroFallback} />}
                    <LinearGradient colors={[huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimEnd]} pointerEvents="none" style={nativeModalStyles.appGroupHeroTopScrim} />
                    <LinearGradient colors={[huddleColors.profileHeroScrimEnd, huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimStart]} pointerEvents="none" style={nativeModalStyles.appGroupHeroBottomScrim} />
                    {groupAvatarBusy ? <View pointerEvents="none" style={styles.groupCoverBusy}><ActivityIndicator color={huddleColors.onPrimary} size="small" /></View> : null}
                    <Text style={nativeModalStyles.appGroupHeroMembers}>{memberCountLabel}</Text>
                    <View style={nativeModalStyles.appGroupHeroCopy}>
                      <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{title}</Text>
                      <View style={nativeModalStyles.appGroupHeroMetaRow}>
                        <Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} />
                        <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{room?.locationLabel || (room?.visibility === "private" ? "Private group" : "Public group")}</Text>
                      </View>
                    </View>
                    {isAdmin ? (
                      <Pressable accessibilityLabel={room?.avatarUrl ? "Change group avatar" : "Add group avatar"} disabled={groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={styles.dialogueGroupHeroAvatarAction}>
                        <Feather color={huddleColors.onPrimary} name={groupAvatarBusy === "upload" ? "loader" : "camera"} size={20} />
                      </Pressable>
                    ) : null}
                  </View>
                  {room?.description || isAdmin ? (
                    <View style={nativeModalStyles.appModalDescriptionCard}>
                      <View style={styles.descriptionHeader}>
                        <Text style={styles.manageLabel}>Description</Text>
                        {isAdmin ? <Pressable disabled={groupDescriptionSaving} onPress={saveGroupDescription} style={styles.iconButton}><Feather color={huddleColors.blue} name={groupDescriptionSaving ? "loader" : groupDescriptionEditing ? "save" : "edit-2"} size={17} /></Pressable> : null}
                      </View>
                      {groupDescriptionEditing ? (
                        <AppModalField multiline onChangeText={setGroupDescriptionDraft} placeholder="Tell members what this group is about." value={groupDescriptionDraft} />
                      ) : (
                        <Text style={styles.sheetBody}>{room?.description || "No description yet."}</Text>
                      )}
                    </View>
                  ) : null}
                  {isAdmin ? (
                    <View style={styles.groupInfoSection}>
                      <Pressable accessibilityLabel="native-chat-group-invite-users-button" onPress={() => { setGroupInfoOpen(false); setGroupManageReturnToInfo(true); void loadGroupManageData(); setGroupManageOpen(true); }} style={styles.managementActionRow}>
                        <View style={styles.managementActionCopy}>
                          <Text style={styles.managementActionTitle}>Invite users</Text>
                          <Text style={styles.managementActionBody}>{groupManageFriends.length ? `${groupManageFriends.length} available` : "Add matched friends"}</Text>
                        </View>
                        <Feather color={huddleColors.iconMuted} name="chevron-right" size={18} />
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={styles.groupInfoSection}>
                    <Text style={styles.manageLabel}>Members</Text>
                    {groupManageLoading && groupManageMembers.length === 0 ? <NativeLoadingState variant="inline" /> : null}
                    {groupManageMembers.map((member) => {
                      const memberRole = room?.createdBy === member.id ? "admin" : "member";
                      return (
                        <View key={member.id} style={styles.memberRow}>
                          <Pressable onPress={() => member.id !== userId && setProfileSheetUserId(member.id)} style={styles.memberIdentity}>
                            <View style={styles.avatarWrap}>
                              <ResilientAvatarImage fallback={<View style={styles.avatar}><Text style={styles.avatarText}>{initials(member.name)}</Text></View>} style={styles.avatar} uri={member.avatarUrl} />
                              <VerifiedAvatarBadge active={member.isVerified} />
                            </View>
                            <Text numberOfLines={1} style={styles.memberName}>{member.id === userId ? `${member.name} (You)` : member.name}</Text>
                          </Pressable>
                          <Text style={styles.groupInfoRole}>{memberRole}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {groupMediaAttachments.length > 0 ? (
                    <>
                      <Text style={styles.manageLabel}>Media ({groupMediaAttachments.length})</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupMediaRail}>
                        {groupMediaAttachments.map((attachment, index) => (
                          <Image key={`${attachment.key}:${index}`} source={{ uri: attachment.uri }} style={styles.groupMediaThumb} />
                        ))}
                      </ScrollView>
                    </>
                  ) : null}
                </View>
              </AppBottomSheetScroll>
              <AppBottomSheetFooter>
                {isAdmin ? (
                  <AppModalButton onPress={() => { setGroupInfoOpen(false); setGroupManageReturnToInfo(true); void loadGroupManageData(); setGroupManageOpen(true); }}>
                    <Text style={styles.primaryActionText}>Invite users</Text>
                  </AppModalButton>
                ) : (
                  <AppModalButton variant="secondary" onPress={() => setGroupInfoOpen(false)}>
                    <Text style={styles.secondaryActionText}>Close</Text>
                  </AppModalButton>
                )}
              </AppBottomSheetFooter>
            </AppBottomSheet>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal presentationStyle="overFullScreen" transparent visible={groupManageOpen} animationType="slide" onRequestClose={() => setGroupManageOpen(false)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setGroupManageOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
          <AppBottomSheet large>
            <AppBottomSheetHeader>
              <View style={styles.manageHeaderTitle}>
                {groupManageReturnToInfo ? <Pressable accessibilityLabel="Back to group details" onPress={() => { setGroupManageOpen(false); setGroupManageSearch(""); setGroupManageReturnToInfo(false); setGroupInfoOpen(true); }} style={styles.iconButton}><Feather color={huddleColors.text} name="chevron-left" size={20} /></Pressable> : null}
                <View><Text style={styles.sheetTitle}>Invite users</Text><Text style={styles.sheetMeta}>Add matched friends and review members.</Text></View>
              </View>
              <AppModalIconButton accessibilityLabel="Close invite users" onPress={() => setGroupManageOpen(false)}>
                <Feather color={huddleColors.text} name="x" size={22} />
              </AppModalIconButton>
            </AppBottomSheetHeader>
            <AppBottomSheetScroll>
              {groupManageLoading && groupManageMembers.length === 0 ? <NativeLoadingState variant="inline" /> : null}
                <Text style={styles.manageLabel}>Members ({groupManageMembers.length})</Text>
                {groupManageMembers.map((member) => (
                  <View key={member.id} style={styles.memberRow}>
                    <Pressable onPress={() => member.id !== userId && setProfileSheetUserId(member.id)} style={styles.memberIdentity}><ResilientAvatarImage fallback={<Text style={styles.avatarText}>{initials(member.name)}</Text>} style={styles.memberAvatar} uri={member.avatarUrl} /><Text style={styles.memberName}>{member.id === userId ? `${member.name} (You)` : member.name}</Text></Pressable>
                    {member.id !== userId ? (
                      <Pressable accessibilityLabel={`More actions for ${member.name}`} hitSlop={huddleSpacing.x2} onPress={() => setGroupMemberActionTarget(member)} style={nativeModalStyles.appModalSocialIconButton}>
                        <Feather color={huddleColors.iconMuted} name="more-horizontal" size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {isAdmin ? (
                  <>
                    <Text style={styles.manageLabel}>Add Members</Text>
                    {groupManageFriends.length > 4 ? <AppModalField onChangeText={setGroupManageSearch} placeholder="Search friends..." value={groupManageSearch} /> : null}
                    {groupManageFriends.filter((member) => member.name.toLowerCase().includes(groupManageSearch.trim().toLowerCase())).map((member) => (
                      <View key={member.id} style={styles.memberRow}>
                        <Pressable onPress={() => setProfileSheetUserId(member.id)} style={styles.memberIdentity}><ResilientAvatarImage fallback={<Text style={styles.avatarText}>{initials(member.name)}</Text>} style={styles.memberAvatar} uri={member.avatarUrl} /><Text style={styles.memberName}>{member.name}</Text></Pressable>
                        <Pressable onPress={() => void inviteGroupMember(member)} style={styles.addMemberButton}><Feather color={huddleColors.blue} name="user-plus" size={16} /></Pressable>
                      </View>
                    ))}
                    {groupManageFriends.filter((member) => member.name.toLowerCase().includes(groupManageSearch.trim().toLowerCase())).length === 0 ? <Text style={styles.emptyInline}>No friends found</Text> : null}
                  </>
                ) : null}
              </AppBottomSheetScroll>
          </AppBottomSheet>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal presentationStyle="overFullScreen" transparent visible={Boolean(groupMemberActionTarget)} animationType="fade" onRequestClose={() => setGroupMemberActionTarget(null)}>
        <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setGroupMemberActionTarget(null)}>
          <View style={nativeModalStyles.appModalMenuCard}>
            <Pressable onPress={() => { if (groupMemberActionTarget) setGroupMemberReportTarget(groupMemberActionTarget); setGroupMemberActionTarget(null); setReportOpen(true); }} style={nativeModalStyles.appModalMenuItem}>
              <Feather color={huddleColors.text} name="flag" size={18} />
              <Text style={styles.menuText}>Report</Text>
            </Pressable>
            <Pressable onPress={() => { setGroupMemberBlockTarget(groupMemberActionTarget); setGroupMemberActionTarget(null); }} style={nativeModalStyles.appModalMenuItem}>
              <Feather color={huddleColors.validationRed} name="slash" size={18} />
              <Text style={styles.menuTextDestructive}>Block user</Text>
            </Pressable>
            {isAdmin ? (
              <Pressable onPress={() => { const member = groupMemberActionTarget; setGroupMemberActionTarget(null); if (member) void removeGroupMember(member); }} style={nativeModalStyles.appModalMenuItem}>
                <Feather color={huddleColors.validationRed} name="trash-2" size={18} />
                <Text style={styles.menuTextDestructive}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>
      <ConfirmModal open={confirmBlockOpen} title={blockState === "blocked_by_me" ? `Unblock ${counterpart?.displayName ?? "this user"}?` : `Block ${counterpart?.displayName ?? "this user"}?`} body={blockState === "blocked_by_me" ? "Allow this user to send you messages again?" : "You will no longer see their posts or alerts, and they won't be able to interact with you."} confirm={blockState === "blocked_by_me" ? "Unblock" : "Block"} destructive={blockState !== "blocked_by_me"} onCancel={() => setConfirmBlockOpen(false)} onConfirm={toggleBlock} />
      <ConfirmModal open={Boolean(groupMemberBlockTarget)} title={`Block ${groupMemberBlockTarget?.name ?? "this member"}?`} body="You will no longer see their posts or alerts, and they won't be able to interact with you." confirm="Block" destructive onCancel={() => setGroupMemberBlockTarget(null)} onConfirm={blockGroupMember} />
      <ConfirmModal open={confirmUnmatchOpen} title="Unmatch user" body="This conversation will be deleted permanently." confirm="Confirm" destructive onCancel={() => setConfirmUnmatchOpen(false)} onConfirm={unmatch} />
      <ConfirmModal open={confirmLeaveOpen} title="Leave group?" body="You'll no longer see new messages in this group." confirm="Leave" destructive onCancel={() => setConfirmLeaveOpen(false)} onConfirm={leaveGroup} />
      <ConfirmModal open={confirmRemoveGroupOpen} title="Remove group?" body="This group and all its content will be permanently deleted. This action cannot be undone." confirm="Remove" destructive onCancel={() => setConfirmRemoveGroupOpen(false)} onConfirm={removeGroup} />
      <ConfirmModal open={groupVerifyGateOpen} title="Identity verification required" body="Complete identity verification to add or remove group members." cancel="Not now" confirm="Verify now" onCancel={() => setGroupVerifyGateOpen(false)} onConfirm={() => { setGroupVerifyGateOpen(false); onNavigate("/verify-identity"); }} />
      <NativePublicProfileModal
        hideActions
        onClose={() => setProfileSheetUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(profileSheetUserId)}
        userId={profileSheetUserId}
      />
      <NativeSocialReportModal
        currentUserId={userId}
        onClose={() => { setReportOpen(false); setGroupMemberReportTarget(null); }}
        onNotice={setNotice}
        open={reportOpen}
        source={isGroup ? "Group Chat" : "Chat"}
        sourceOrigin="friends chats"
        target={groupMemberReportTarget ? { userId: groupMemberReportTarget.id, author: { displayName: groupMemberReportTarget.name, socialId: groupMemberReportTarget.socialId, avatarUrl: groupMemberReportTarget.avatarUrl, verificationStatus: groupMemberReportTarget.isVerified ? "verified" : null, locationCountry: null, lastLat: null, lastLng: null, isVerified: groupMemberReportTarget.isVerified, nonSocial: false } } : counterpart ? { userId: counterpart.id, author: { displayName: counterpart.displayName, socialId: counterpart.socialId, avatarUrl: counterpart.avatarUrl, verificationStatus: counterpart.isVerified ? "verified" : null, locationCountry: null, lastLat: null, lastLng: null, isVerified: counterpart.isVerified, nonSocial: false } } : isGroup && groupOwner ? { userId: groupOwner.id, author: { displayName: groupOwner.displayName, socialId: groupOwner.socialId, avatarUrl: groupOwner.avatarUrl, verificationStatus: groupOwner.isVerified ? "verified" : null, locationCountry: null, lastLat: null, lastLng: null, isVerified: groupOwner.isVerified, nonSocial: false } } : null}
      />
    </KeyboardAvoidingView>
  );
}

function NativeAttachmentVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView contentFit="cover" nativeControls player={player} style={styles.attachmentImage} />;
}

function VerifiedAvatarBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return <View style={styles.verifiedBadge}><NativeVerifiedBadge compact variant="avatar" /></View>;
}

function ConfirmModal({
  body,
  cancel = "Cancel",
  confirm,
  destructive,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  body: string;
  cancel?: string;
  confirm: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <Modal presentationStyle="overFullScreen" transparent visible={open} animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()}>
        <AppModalCard>
          <View style={styles.confirmContent}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmBody}>{body}</Text>
          <AppModalActionRow>
            <AppModalButton variant="secondary" onPress={onCancel}><Text style={styles.secondaryActionText}>{cancel}</Text></AppModalButton>
            <AppModalButton variant={destructive ? "destructive" : "primary"} onPress={onConfirm}><Text style={styles.primaryActionText}>{confirm}</Text></AppModalButton>
          </AppModalActionRow>
          </View>
        </AppModalCard>
        </Pressable>
      </Pressable>
    </Modal>
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
  avatar: { width: 36, height: 36, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blueSoft, overflow: "hidden" },
  avatarVerified: { borderWidth: 1, borderColor: huddleColors.blue },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  verifiedBadge: { position: "absolute", right: -4, bottom: -3 },
  headerSkeletonAvatar: { backgroundColor: huddleColors.mutedCanvas },
  headerSkeletonTitle: { width: "54%", height: huddleType.labelLine, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  headerSkeletonSubtitle: { width: "36%", height: huddleType.helperLine, marginTop: huddleSpacing.x1, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  title: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  subtitle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  notice: { flexDirection: "row", gap: huddleSpacing.x2, margin: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.primarySoftFill },
  noticeText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, padding: huddleSpacing.x5 },
  emptyTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text, textAlign: "center" },
  emptyBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext, textAlign: "center" },
  emptyAction: { marginTop: huddleSpacing.x2, ...huddleButtons.base, ...huddleButtons.primary, paddingHorizontal: huddleSpacing.x5 },
  emptyActionText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  emptyInline: { alignSelf: "flex-start", paddingVertical: huddleSpacing.x2, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  messages: { padding: huddleSpacing.x4, paddingBottom: huddleSpacing.x5, gap: huddleSpacing.x2 },
  messagesScroll: { flex: 1 },
  dayDivider: { alignSelf: "center", marginVertical: huddleSpacing.x2, paddingHorizontal: 10, paddingVertical: 2, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.toggleOff, fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  roomCode: { alignSelf: "center", marginBottom: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.premiumGoldSoft, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.premiumGold },
  loadMore: { alignSelf: "center", paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  loadMoreText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  systemPill: { alignSelf: "center", maxWidth: "80%", marginVertical: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.blueSoft, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.blue, textAlign: "center" },
  membershipPill: { alignSelf: "center", marginVertical: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.toggleOff, fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 16, color: huddleColors.mutedText, textAlign: "center" },
  starPill: { alignSelf: "center", marginVertical: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, borderRadius: huddleRadii.pill, overflow: "hidden", backgroundColor: huddleColors.premiumGoldSoft, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.premiumGold },
  latestButton: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  latestText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  senderName: { marginLeft: huddleSpacing.x1, marginBottom: 2, fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  messageRowMine: { justifyContent: "flex-end" },
  messageBubble: { maxWidth: "90%", borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderWidth: 1 },
  messageBubbleMine: { backgroundColor: huddleColors.blueSoft, borderColor: huddleColors.fieldFocusBorder },
  messageBubbleTheirs: { backgroundColor: huddleColors.canvas, borderColor: huddleColors.fieldBorderStrong },
  messageBubbleCounterpart: { backgroundColor: huddleColors.canvas, borderColor: huddleColors.fieldBorderStrong },
  messageBubbleStar: { backgroundColor: huddleColors.premiumGoldSoft, borderColor: huddleColors.premiumGold },
  messageText: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  messageTextMine: { color: huddleColors.blue },
  starText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.premiumGold },
  messageMeta: { flexDirection: "row", gap: huddleSpacing.x1, marginTop: huddleSpacing.x1, paddingLeft: huddleSpacing.x1 },
  messageMetaMine: { justifyContent: "flex-end", paddingRight: huddleSpacing.x1 },
  messageTime: { fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  readMark: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.mutedText },
  readMarkSeen: { color: huddleColors.blue },
  attachmentGrid: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x1, marginBottom: huddleSpacing.x2 },
  attachmentPreview: { width: 144, height: 144, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.button, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.glassBorder },
  attachmentImage: { width: "100%", height: "100%" },
  shareThumb: { width: 72, height: 72, overflow: "hidden", borderRadius: huddleRadii.button, backgroundColor: huddleColors.canvas },
  shareThumbImage: { width: "100%", height: "100%" },
  shareTextWrap: { flex: 1, minWidth: 0 },
  shareTitle: { fontFamily: "Urbanist-700", fontSize: 13, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  shareDescription: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  uploadRail: { gap: huddleSpacing.x2, paddingRight: huddleSpacing.x6 },
  uploadThumb: { width: huddleSpacing.x9, height: huddleSpacing.x9, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.button, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.mutedCanvas },
  uploadImage: { width: "100%", height: "100%" },
  uploadVideoThumb: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.backdrop },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, backgroundColor: huddleColors.backdrop },
  uploadingText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: 16, color: huddleColors.onPrimary },
  removeUpload: { position: "absolute", top: huddleSpacing.x2, right: huddleSpacing.x2, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop },
  safetyLock: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.premiumGoldSoft },
  safetyText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  composerRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  attachButton: { width: 32, height: 40, alignItems: "flex-start", justifyContent: "center", borderWidth: 0, backgroundColor: "transparent" },
  sendButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  mediaPreviewBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.backdrop },
  mediaPreviewImage: { width: "100%", height: "100%" },
  menuText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  menuTextDestructive: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.validationRed },
  sheetHeader: { borderBottomWidth: 0 },
  sheetTitle: { flex: 1, fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  groupInfoSheetBody: { gap: huddleSpacing.x4 },
  groupCoverBusy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.backdrop },
  dialogueGroupHeroAvatarAction: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x10, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.backdrop },
  groupInfoSection: { gap: huddleSpacing.x2 },
  groupInfoHeaderIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupInfoHeaderAvatar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blueSoft },
  groupInfoHeaderAvatarImage: { width: "100%", height: "100%" },
  groupInfoHeaderTitleWrap: { flex: 1, minWidth: 0 },
  groupInfoNameField: { minHeight: 44, paddingVertical: 0 },
  groupInfoNameButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blueSoft },
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
  addMemberButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blueSoft },
  compactButtonText: { ...huddleButtons.label, fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  confirmContent: { gap: huddleSpacing.x3, padding: huddleSpacing.x4, paddingTop: huddleSpacing.x5 },
  confirmTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  confirmBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  secondaryActionText: { ...huddleButtons.label, color: huddleColors.text },
  primaryActionText: { ...huddleButtons.label, color: huddleColors.onPrimary },
});
