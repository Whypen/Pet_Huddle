import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowDown, ArrowLeft, BadgeCheck, ChevronLeft, ImagePlus, Loader2, MoreVertical, SendHorizontal, Settings, ShieldAlert, UserX, Users, Bell, BellOff, UserPlus, LogOut, Image as ImageIcon, Lock, Pencil, Save, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildJoinSignInPath } from "@/lib/authIntent";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureDirectChatRoom } from "@/lib/chatRooms";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProfileShareCard } from "@/components/profile/ProfileShareCard";
import { isStarIntroKind, parseStarChatContent } from "@/lib/starChat";
import { parseChatShareMessage, type ShareModel } from "@/lib/shareModel";
import { SharedContentCard } from "@/components/chat/SharedContentCard";
import { GroupDetailsPanel } from "@/components/chat/GroupDetailsPanel";
import { ReportModal } from "@/components/moderation/ReportModal";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import { updateGroupChatMetadata } from "@/lib/groupChats";
import {
  extractFirstHttpUrl,
  fetchExternalLinkPreview,
  stripExternalUrlFromText,
  type ExternalLinkPreview,
} from "@/lib/externalLinkPreview";
import { ExternalLinkPreviewCard } from "@/components/ui/ExternalLinkPreviewCard";
import { markChatRoomSeen } from "@/lib/chatSeen";
import {
  TEAM_HUDDLE_AVAILABILITY,
  TEAM_HUDDLE_DISPLAY_NAME,
  TEAM_HUDDLE_USER_ID,
  isTeamHuddleIdentity,
  resolveTeamHuddleAvatar,
} from "@/lib/teamHuddleIdentity";
import { isVerifiedProfile } from "@/lib/verification";

type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type DialogueRoom = {
  id?: string | null;
  type?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  visibility?: "public" | "private" | null;
  room_code?: string | null;
  location_label?: string | null;
  description?: string | null;
};

type DialogueMember = {
  user_id?: string | null;
  role?: string | null;
};

type DialogueSnapshot = {
  room: DialogueRoom | null;
  members: DialogueMember[];
  messages: ChatMessage[];
  readMessageIds: Set<string>;
};

const dialogueLoadToast = (stage: string) => {
  if (stage === "messages") return "Messages didn't load. Try again in a moment.";
  if (stage === "counterpart") return "Chat details didn't load. Try again in a moment.";
  if (stage === "group_or_room_identity") return "Chat details didn't load. Try again in a moment.";
  if (stage === "matched_fallback_target") return "You no longer have access to this conversation.";
  return "Couldn't open that conversation. Try again in a moment.";
};

const fetchDialogueSnapshot = async (
  chatId: string,
  options: { beforeCreatedAt?: string | null; limit?: number } = {},
): Promise<DialogueSnapshot> => {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "get_native_chat_dialogue_snapshot",
    {
      p_chat_id: chatId,
      p_before_created_at: options.beforeCreatedAt || null,
      p_limit: options.limit ?? 50,
      p_target_message_id: null,
    },
  );
  if (error) throw error;
  const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const messages = (Array.isArray(payload.messages) ? payload.messages : [])
    .map((row) => row as Partial<ChatMessage>)
    .filter((row): row is ChatMessage => Boolean(row.id && row.sender_id && typeof row.content === "string" && row.created_at));
  return {
    room: payload.room && typeof payload.room === "object" ? payload.room as DialogueRoom : null,
    members: (Array.isArray(payload.members) ? payload.members : []) as DialogueMember[],
    messages,
    readMessageIds: new Set(
      (Array.isArray(payload.read_message_ids) ? payload.read_message_ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  };
};

const fetchChatProfileSummaries = async (userIds: string[]) => {
  const ids = Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [] as Record<string, unknown>[];
  const { data, error } = await supabase.rpc("get_native_chat_profile_summaries", {
    p_user_ids: ids,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
};

type Attachment = {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  mime: string;
  name: string;
  size?: number | null;
};

type ParsedMessage = {
  text: string;
  attachments: Attachment[];
  linkPreviewUrl?: string | null;
  kind?: string | null;
  senderId?: string | null;
  recipientId?: string | null;
  share?: ShareModel | null;
};

type CounterpartProfile = {
  id: string;
  displayName: string;
  socialId: string | null;
  avatarUrl: string | null;
  availability: string | null;
  isVerified: boolean;
  hasCar: boolean;
  isTeamHuddle: boolean;
};

type BlockState = "none" | "blocked_by_them" | "blocked_by_me";
type UnmatchState = "none" | "unmatched_by_them" | "unmatched_by_me";
const INITIAL_MESSAGE_LOAD_SIZE = 10;
const OLDER_MESSAGE_PAGE_SIZE = 20;
const MESSAGE_READ_BUFFER_MS = 100;

const formatMessageTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
};

const formatDividerLabel = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const now = new Date();
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const daysDiff = Math.floor((startOfNow.getTime() - startOfDt.getTime()) / (24 * 60 * 60 * 1000));
  if (daysDiff <= 0) return "";
  if (daysDiff === 1) return "Yesterday";
  if (daysDiff < 7) {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt);
  }
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1);
  return `${day}/${month}/${dt.getFullYear()}`;
};

const normalizeAvailabilityLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^animal friend\s*\(no pet\)$/i.test(trimmed)) return "Animal Friend";
  return trimmed;
};

const ChatDialogue = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { isActive } = useSafetyRestrictions();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>("Conversation");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counterpart, setCounterpart] = useState<CounterpartProfile | null>(null);
  const [blockState, setBlockState] = useState<BlockState>("none");
  const [unmatchState, setUnmatchState] = useState<UnmatchState>("none");
  const isUnmatched = unmatchState !== "none";
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [confirmUnmatchOpen, setConfirmUnmatchOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [composerUploads, setComposerUploads] = useState<File[]>([]);
  const [uploadingComposer, setUploadingComposer] = useState(false);
  const [signedAttachmentUrls, setSignedAttachmentUrls] = useState<Record<string, string | null>>({});
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState<Record<string, ExternalLinkPreview>>({});
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const returnToInbox = searchParams.get("tab") === "groups"
    ? `/chats?tab=groups${searchParams.get("view") === "explore" ? "&view=explore" : ""}`
    : "/chats";
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [groupCreatedBy, setGroupCreatedBy] = useState<string | null>(null);
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [groupDescription, setGroupDescription] = useState("");
  const [groupVisibility, setGroupVisibility] = useState<"public" | "private" | null>(null);
  const [groupRoomCode, setGroupRoomCode] = useState<string | null>(null);
  const [groupLocationLabel, setGroupLocationLabel] = useState<string | null>(null);
  const [groupIsAdmin, setGroupIsAdmin] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupMuted, setGroupMuted] = useState(false);
  const [groupMediaUrls, setGroupMediaUrls] = useState<string[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Inline manage members — stays within ChatDialogue, no navigate-away
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [groupManageMembers, setGroupManageMembers] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [groupManageFriends, setGroupManageFriends] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [groupManageSearch, setGroupManageSearch] = useState("");
  const [groupManageDescriptionDraft, setGroupManageDescriptionDraft] = useState("");
  const [groupManageDescriptionEditing, setGroupManageDescriptionEditing] = useState(false);
  const [groupManageDescriptionSaving, setGroupManageDescriptionSaving] = useState(false);
  const [groupManageImageUploading, setGroupManageImageUploading] = useState(false);
  const [groupManageLoading, setGroupManageLoading] = useState(false);
  const [groupManageReturnToInfo, setGroupManageReturnToInfo] = useState(false);
  const [groupVerifyGateOpen, setGroupVerifyGateOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [confirmRemoveGroupOpen, setConfirmRemoveGroupOpen] = useState(false);
  const fetchedSenderIdsRef = useRef<Set<string>>(new Set());
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const readFlushTimerRef = useRef<number | null>(null);
  const readFlushInFlightRef = useRef(false);
  const pendingInitialScrollRef = useRef(false);
  const joinedGroupHydrationRef = useRef<string | null>(null);
  const receiptRefreshTimersRef = useRef<number[]>([]);
  const composerPreviewUrls = useMemo(
    () =>
      composerUploads.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        url: URL.createObjectURL(file),
      })),
    [composerUploads],
  );

  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const canSendVideo = tier === "gold";
  const chatDisabledBySafety = isActive("chat_disabled");
  const composerFirstUrl = useMemo(() => {
    const url = extractFirstHttpUrl(chatInput);
    return url && !dismissedPreviewUrls.has(url) ? url : null;
  }, [chatInput, dismissedPreviewUrls]);
  const activeComposerPreviewUrl = lockedPreviewUrl && !dismissedPreviewUrls.has(lockedPreviewUrl)
    ? lockedPreviewUrl
    : composerFirstUrl;
  const composerPreview = activeComposerPreviewUrl ? linkPreviewByUrl[activeComposerPreviewUrl] || null : null;
  const markCurrentRoomSeen = useCallback(() => {
    if (!profile?.id || !roomId || messages.length === 0) return;
    const latestMessage = messages[messages.length - 1];
    markChatRoomSeen(profile.id, roomId, latestMessage?.created_at || null);
  }, [messages, profile?.id, roomId]);
  const parseMessageContent = useCallback((content: string): ParsedMessage => {
    const share = parseChatShareMessage(content);
    if (share) {
      return {
        text: "",
        attachments: [],
        share,
      };
    }
    const starParsed = parseStarChatContent(content);
    if (isStarIntroKind(starParsed.kind)) {
      return {
        text: starParsed.text || "Star connection started.",
        attachments: [],
        kind: starParsed.kind,
        senderId: starParsed.senderId,
        recipientId: starParsed.recipientId,
        share: null,
      };
    }
    try {
      const parsed = JSON.parse(content) as { text?: string; attachments?: Attachment[]; kind?: string; linkPreviewUrl?: string | null };
      if (parsed && typeof parsed === "object") {
        // System messages: {"kind":"system","text":"..."}
        if (parsed.kind === "system") {
          return { text: String(parsed.text || ""), attachments: [], share: null, kind: "system" };
        }
        if (Array.isArray(parsed.attachments) || typeof parsed.text === "string" || typeof parsed.linkPreviewUrl === "string") {
          return {
            text: String(parsed.text || ""),
            linkPreviewUrl: typeof parsed.linkPreviewUrl === "string" ? parsed.linkPreviewUrl : null,
            attachments: (parsed.attachments || [])
              .filter((item) => {
                if (!item || typeof item !== "object") return false;
                const hasLegacyUrl = typeof item.url === "string" && item.url.trim().length > 0;
                const hasPrivateRef = item.bucket === "chat_attachments" && typeof item.path === "string" && item.path.trim().length > 0;
                return hasLegacyUrl || hasPrivateRef;
              })
              .map((item) => ({
                url: typeof item.url === "string" ? item.url : null,
                bucket: typeof item.bucket === "string" ? item.bucket : null,
                path: typeof item.path === "string" ? item.path : null,
                mime: String(item.mime || ""),
                name: String(item.name || "media"),
                size: typeof item.size === "number" ? item.size : null,
              })),
            share: null,
          };
        }
      }
    } catch {
      // plain text fallback
    }
    return { text: content, attachments: [], share: null };
  }, []);

  useEffect(() => {
    return () => {
      composerPreviewUrls.forEach((item) => URL.revokeObjectURL(item.url));
      receiptRefreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [composerPreviewUrls]);

  const snapToLatestMessage = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = messagesViewportRef.current;
        if (!viewport) return;
        viewport.scrollTop = viewport.scrollHeight;
      });
    });
  }, []);

  const flushPendingMessageReads = useCallback(async () => {
    if (!profile?.id || !roomId || readFlushInFlightRef.current) return;
    const pendingIds = Array.from(pendingReadIdsRef.current);
    if (pendingIds.length === 0) return;

    pendingReadIdsRef.current = new Set();
    readFlushInFlightRef.current = true;

    const { error: upsertError } = await (supabase.rpc as unknown as (
      fn: string,
      params: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>)("mark_room_read_messages", {
      p_chat_id: roomId,
      p_visible_message_ids: pendingIds,
    });

    if (upsertError) {
      pendingIds.forEach((messageId) => pendingReadIdsRef.current.add(messageId));
      console.warn("[ChatDialogue] mark read failed", upsertError.message);
    }

    readFlushInFlightRef.current = false;
    if (pendingReadIdsRef.current.size > 0) {
      if (readFlushTimerRef.current !== null) {
        window.clearTimeout(readFlushTimerRef.current);
      }
      readFlushTimerRef.current = window.setTimeout(() => {
        readFlushTimerRef.current = null;
        void flushPendingMessageReads();
      }, MESSAGE_READ_BUFFER_MS);
    }
  }, [profile?.id, roomId]);

  const markMessagesAsRead = useCallback((roomMessages: ChatMessage[]) => {
    if (!profile?.id || roomMessages.length === 0) return;

    let queued = false;
    roomMessages.forEach((message) => {
      const messageId = String(message.id || "");
      if (!messageId || !message.sender_id || message.sender_id === profile.id) return;
      if (pendingReadIdsRef.current.has(messageId)) return;
      pendingReadIdsRef.current.add(messageId);
      queued = true;
    });

    if (!queued || readFlushTimerRef.current !== null) return;
    readFlushTimerRef.current = window.setTimeout(() => {
      readFlushTimerRef.current = null;
      void flushPendingMessageReads();
    }, MESSAGE_READ_BUFFER_MS);
  }, [flushPendingMessageReads, profile?.id]);

  useEffect(() => {
    return () => {
      if (readFlushTimerRef.current !== null) {
        window.clearTimeout(readFlushTimerRef.current);
        readFlushTimerRef.current = null;
      }
      void flushPendingMessageReads();
    };
  }, [flushPendingMessageReads, roomId]);

  const loadGroupInfo = useCallback(async (nextRoomId: string): Promise<boolean> => {
    const snapshot = await fetchDialogueSnapshot(nextRoomId, { limit: 1 });
    const row = snapshot.room;
    if (!row || row.type !== "group") return false;

    setIsGroup(true);
    setGroupAvatarUrl(row.avatar_url || null);
    setGroupCreatedBy(row.created_by || null);
    setRoomName(row.name || "Group");
    setGroupDescription(String(row.description || ""));
    setGroupVisibility(row.visibility || null);
    setGroupRoomCode(row.room_code || null);
    setGroupLocationLabel(row.location_label || null);
    setGroupIsAdmin((row.created_by || null) === profile?.id);

    try {
      const memberIds = snapshot.members.map((member) => String(member.user_id || "").trim()).filter(Boolean);
      const [{ data: memberState }, memberProfiles] = await Promise.all([
        profile?.id
          ? supabase.rpc("get_native_group_member_state", { p_chat_id: nextRoomId })
          : Promise.resolve({ data: null }),
        fetchChatProfileSummaries(memberIds),
      ]);
      const ownState = (Array.isArray(memberState) ? memberState[0] : memberState) as {
        is_muted?: boolean;
        role?: string | null;
      } | null;
      setGroupMemberCount(memberIds.length);
      setGroupMuted(ownState?.is_muted === true);
      setGroupIsAdmin(
        (row.created_by || null) === profile?.id ||
        String(ownState?.role || "").toLowerCase() === "admin" ||
        snapshot.members.some((member) => member.user_id === profile?.id && String(member.role || "").toLowerCase() === "admin")
      );

      if (memberIds.length === 0) return;
      memberIds.forEach((id) => fetchedSenderIdsRef.current.add(id));
      const nameMap: Record<string, string> = {};
      memberProfiles.forEach((member) => {
        const id = String(member.id || "").trim();
        const displayName = String(member.display_name || "").trim();
        if (id && displayName) nameMap[id] = displayName;
      });
      setSenderNames(nameMap);
    } catch (error) {
      console.warn("[ChatDialogue] load group details failed", error);
    }

    return true;
  }, [profile?.id]);

  const loadRoomMessages = useCallback(async (nextRoomId: string) => {
    const snapshot = await fetchDialogueSnapshot(nextRoomId, { limit: INITIAL_MESSAGE_LOAD_SIZE + 1 });
    const nextMessages = snapshot.messages.slice(-INITIAL_MESSAGE_LOAD_SIZE);
    setHasOlderMessages(snapshot.messages.length > INITIAL_MESSAGE_LOAD_SIZE);
    setMessages(nextMessages);
    setReadMessageIds(snapshot.readMessageIds);
    void markMessagesAsRead(nextMessages);
  }, [markMessagesAsRead]);

  useLayoutEffect(() => {
    if (!pendingInitialScrollRef.current || loading) return;
    pendingInitialScrollRef.current = false;
    snapToLatestMessage();
    markCurrentRoomSeen();
    setShowScrollToBottom(false);
  }, [loading, markCurrentRoomSeen, messages, snapToLatestMessage]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || loading || !roomId || messages.length === 0) return;
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceToBottom <= 120) {
      markCurrentRoomSeen();
    }
    setShowScrollToBottom(distanceToBottom > 120);
  }, [loading, markCurrentRoomSeen, messages, roomId]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || loadingOlderMessages || !hasOlderMessages || messages.length === 0) return;
    const oldestCreatedAt = messages[0]?.created_at;
    if (!oldestCreatedAt) return;
    setLoadingOlderMessages(true);
    const viewport = messagesViewportRef.current;
    const previousHeight = viewport?.scrollHeight || 0;
    try {
      const snapshot = await fetchDialogueSnapshot(roomId, {
        beforeCreatedAt: oldestCreatedAt,
        limit: OLDER_MESSAGE_PAGE_SIZE + 1,
      });
      const olderMessages = snapshot.messages.slice(-OLDER_MESSAGE_PAGE_SIZE);
      setHasOlderMessages(snapshot.messages.length > OLDER_MESSAGE_PAGE_SIZE);
      if (olderMessages.length === 0) return;
      setMessages((prev) => [...olderMessages, ...prev]);
      void markMessagesAsRead(olderMessages);
      requestAnimationFrame(() => {
        const nextHeight = viewport?.scrollHeight || 0;
        if (viewport) viewport.scrollTop += nextHeight - previousHeight;
      });
    } catch {
      toast.error("Unable to load older messages.");
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [hasOlderMessages, loadingOlderMessages, markMessagesAsRead, messages, roomId]);

  const refreshReadReceipts = useCallback(async (messageRows?: ChatMessage[]) => {
    if (!roomId || !profile?.id) return;
    const sourceRows = messageRows || messages;
    if (sourceRows.length === 0) {
      setReadMessageIds(new Set());
      return;
    }
    const myMessageIds = sourceRows.filter((message) => message.sender_id === profile.id).map((message) => message.id);
    if (myMessageIds.length === 0) {
      setReadMessageIds(new Set());
      return;
    }
    const { data } = await supabase.rpc("get_native_chat_read_receipts", {
      p_message_ids: myMessageIds,
    });
    setReadMessageIds(new Set(
      ((data || []) as { message_id?: string | null }[])
        .map((row) => String(row.message_id || "").trim())
        .filter(Boolean),
    ));
  }, [messages, profile?.id, roomId]);

  const scheduleReadReceiptRefresh = useCallback((delays: number[] = [80, 420]) => {
    receiptRefreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    receiptRefreshTimersRef.current = delays.map((delay) =>
      window.setTimeout(() => {
        void refreshReadReceipts();
      }, delay),
    );
  }, [refreshReadReceipts]);

  const openUserProfile = useCallback(async (userId: string, fallbackDisplayName: string) => {
    if (!userId || isTeamHuddleIdentity(fallbackDisplayName, null)) return;
    setProfileSheetUserId(userId);
    setProfileSheetOpen(true);
  }, []);

  const latestStarIntro = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const parsed = parseMessageContent(messages[index].content);
      if (isStarIntroKind(parsed.kind || null)) {
        return parsed;
      }
    }
    return null;
  }, [messages, parseMessageContent]);
  const starSenderId = latestStarIntro?.senderId || null;
  const firstStarUserMessageId = useMemo(() => {
    if (!starSenderId) return null;
    for (const message of messages) {
      const parsed = parseMessageContent(message.content);
      if (isStarIntroKind(parsed.kind || null)) continue;
      if (message.sender_id !== starSenderId) continue;
      if (parsed.attachments.length === 0 && !parsed.text.trim()) continue;
      return message.id;
    }
    return null;
  }, [messages, parseMessageContent, starSenderId]);

  const loadCounterpart = useCallback(async (nextRoomId: string, fallbackName: string, hintUserId?: string | null) => {
    if (!profile?.id) return;
    const counterpartId = hintUserId && hintUserId !== profile.id ? hintUserId : null;
    if (!counterpartId) return;

    const [profiles, relationshipResult] = await Promise.all([
      // NativeChatDialogueScreen treats profile hydration as enrichment: a
      // private conversation must still open with the route/inbox identity
      // when this optional reader is unavailable.
      fetchChatProfileSummaries([counterpartId]).catch((error) => {
        console.warn("[chats.dialogue.profile_hydration_failed]", {
          code: error instanceof Error ? error.message : "unknown_error",
        });
        return [] as Record<string, unknown>[];
      }),
      supabase.rpc("check_native_direct_relationship", { p_target_user_id: counterpartId }),
    ]);
    if (relationshipResult.error) throw relationshipResult.error;
    const relationship = relationshipResult.data && typeof relationshipResult.data === "object"
      ? relationshipResult.data as { allowed?: boolean; blocked?: boolean; unmatched?: boolean }
      : null;
    if (relationship?.allowed !== true) throw new Error("direct_relationship_unavailable");
    const profileRow = profiles[0] || null;

    const displayName = String(profileRow?.display_name || fallbackName || "Conversation");
    const socialId = typeof profileRow?.social_id === "string" && profileRow.social_id ? String(profileRow.social_id) : null;
    const isOfficialTeamHuddle =
      counterpartId === TEAM_HUDDLE_USER_ID || isTeamHuddleIdentity(displayName, socialId);
    const availabilityList = Array.isArray(profileRow?.availability_status)
      ? profileRow.availability_status.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
    const availability =
      availabilityList.length > 0
        ? availabilityList.map((entry) => normalizeAvailabilityLabel(entry)).filter(Boolean).join(" • ")
        : normalizeAvailabilityLabel(String(profileRow?.social_role || profileRow?.user_role || ""));

    setRoomName(isOfficialTeamHuddle ? TEAM_HUDDLE_DISPLAY_NAME : displayName);
    setCounterpart({
      id: counterpartId,
      displayName: isOfficialTeamHuddle ? TEAM_HUDDLE_DISPLAY_NAME : displayName,
      socialId,
      avatarUrl: isOfficialTeamHuddle
        ? resolveTeamHuddleAvatar(null, TEAM_HUDDLE_DISPLAY_NAME, "teamhuddle")
        : resolveTeamHuddleAvatar((profileRow?.avatar_url as string | null) || null, displayName, socialId),
      availability: isOfficialTeamHuddle ? TEAM_HUDDLE_AVAILABILITY : (availability || null),
      isVerified: isOfficialTeamHuddle ? true : isVerifiedProfile(profileRow),
      hasCar: Boolean(profileRow?.has_car),
      isTeamHuddle: isOfficialTeamHuddle,
    });

    setBlockState("none");
    setUnmatchState("none");
  }, [profile?.id]);

  const attachmentStorageKey = useCallback((attachment: Attachment) => (
    attachment.bucket === "chat_attachments" && attachment.path ? `${attachment.bucket}:${attachment.path}` : null
  ), []);

  const resolveAttachmentUrl = useCallback((attachment: Attachment) => {
    const storageKey = attachmentStorageKey(attachment);
    if (storageKey) return signedAttachmentUrls[storageKey] || "";
    return attachment.url || "";
  }, [attachmentStorageKey, signedAttachmentUrls]);

  const uploadFilesToPrivateChatAttachments = useCallback(async (files: File[]): Promise<Attachment[]> => {
    if (!profile?.id || !roomId || files.length === 0) return [];
    const uploaded: Attachment[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const ext = (file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/").pop() || "bin")?.replace(/[^a-z0-9]/gi, "") || "bin";
      const path = `${profile.id}/chat-media/${roomId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat_attachments").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) {
        console.error("[chat.upload.failed]", { path, message: uploadError.message });
        throw uploadError;
      }
      uploaded.push({
        bucket: "chat_attachments",
        path,
        url: null,
        mime: file.type || "",
        name: file.name || `file-${i + 1}`,
        size: file.size,
      });
    }
    return uploaded;
  }, [profile?.id, roomId]);

  const appendComposerUploads = useCallback((files: File[]) => {
    const allowed = files.filter((file) => {
      if (!file.type?.startsWith("video/")) return true;
      return canSendVideo;
    });
    if (files.some((file) => file.type?.startsWith("video/")) && !canSendVideo) {
      toast.info("Video upload is for Gold members only.");
    }
    if (allowed.length > 0) {
      setComposerUploads((prev) => [...prev, ...allowed].slice(0, 10));
    }
  }, [canSendVideo]);

  useEffect(() => {
    if (!profile?.id) {
      navigate(buildJoinSignInPath(`/chat-dialogue?${searchParams.toString()}`), { replace: true });
      return;
    }

    const room = searchParams.get("room");
    const joinedGroup = searchParams.get("joined") === "1";
    const name = searchParams.get("name") || "Conversation";
    const hintedUserId = searchParams.get("with");
    setLoading(true);
    setRoomName(name);
    setIsGroup(false);
    setCounterpart(null);
    setMessages([]);
    setHasOlderMessages(false);
    setReadMessageIds(new Set());
    setSenderNames({});
    setGroupAvatarUrl(null);
    setGroupMemberCount(0);
    setGroupDescription("");
    setGroupVisibility(null);
    setGroupRoomCode(null);
    setGroupLocationLabel(null);
    setGroupIsAdmin(false);
    setGroupMuted(false);
    setBlockState("none");
    setUnmatchState("none");
    setShowScrollToBottom(false);
    if (room) {
      void (async () => {
        let loadStage = "dialogue_snapshot";
        try {
          setRoomId(room);
          const routeSnapshot = await fetchDialogueSnapshot(room, { limit: 1 });
          const membership = routeSnapshot.room && routeSnapshot.members.some((member) => member.user_id === profile.id);

          if (membership) {
            loadStage = "group_or_room_identity";
            const grouped = await loadGroupInfo(room);
            let directTargetId: string | null = null;
            if (!grouped) {
              const otherMemberIds = routeSnapshot.members
                .map((member) => String(member.user_id || "").trim())
                .filter((userId) => Boolean(userId) && userId !== profile.id);
              const safeHintedUserId = hintedUserId && hintedUserId !== profile.id ? hintedUserId : null;
              directTargetId = safeHintedUserId && otherMemberIds.includes(safeHintedUserId)
                ? safeHintedUserId
                : otherMemberIds[0] || null;
            }
            const nextRoomId = room;
            loadStage = "messages";
            await loadRoomMessages(nextRoomId);
            if (!grouped) {
              loadStage = "counterpart";
              await loadCounterpart(nextRoomId, name, directTargetId);
            } else if (joinedGroup) {
              joinedGroupHydrationRef.current = nextRoomId;
            }
            pendingInitialScrollRef.current = true;
            setLoading(false);
            return;
          }

          let fallbackTargetId: string | null = null;
          loadStage = "matched_fallback_target";
          const { data: fallbackData, error: fallbackError } = await supabase.rpc(
            "get_native_matched_fallback_target",
            { p_chat_id: room },
          );
          if (fallbackError) throw fallbackError;
          const fallbackRow = fallbackData && typeof fallbackData === "object"
            ? fallbackData as { target_user_id?: string | null }
            : null;
          fallbackTargetId = String(fallbackRow?.target_user_id || "").trim() || null;

          if (!fallbackTargetId || fallbackTargetId === profile.id) {
            throw new Error("room_not_accessible");
          }

          loadStage = "direct_room";
          const nextRoomId = await ensureDirectChatRoom(supabase, profile.id, fallbackTargetId, name);
          setRoomId(nextRoomId);
          loadStage = "group_or_room_identity";
          const grouped2 = await loadGroupInfo(nextRoomId);
          loadStage = "messages";
          await loadRoomMessages(nextRoomId);
          if (!grouped2) {
            loadStage = "counterpart";
            await loadCounterpart(nextRoomId, name, fallbackTargetId);
          } else if (joinedGroup) {
            joinedGroupHydrationRef.current = nextRoomId;
          }
          pendingInitialScrollRef.current = true;
          setLoading(false);
          navigate(
            `/chat-dialogue?room=${encodeURIComponent(nextRoomId)}&name=${encodeURIComponent(name)}&with=${encodeURIComponent(fallbackTargetId)}`,
            { replace: true }
          );
        } catch (error) {
          console.warn("[chats.dialogue.load_failed]", {
            stage: loadStage,
            code: error instanceof Error ? error.message : "unknown_error",
          });
          toast.error(dialogueLoadToast(loadStage));
          navigate("/chats?tab=chats", { replace: true });
        } finally {
          setLoading((prev) => (roomId ? prev : false));
        }
      })();
      return;
    }

    const targetUserId = searchParams.get("with") || searchParams.get("id");
    const targetName = searchParams.get("name") || "Conversation";
    if (!targetUserId || targetUserId === profile.id) {
      navigate("/chats?tab=chats", { replace: true });
      return;
    }

    void (async () => {
      let loadStage = "direct_room";
      try {
        const directRoomId = await ensureDirectChatRoom(supabase, profile.id, targetUserId, targetName);
        setRoomId(directRoomId);
        loadStage = "messages";
        await loadRoomMessages(directRoomId);
        loadStage = "counterpart";
        await loadCounterpart(directRoomId, targetName, targetUserId);
        pendingInitialScrollRef.current = true;
        setLoading(false);
      } catch (error) {
        console.warn("[chats.dialogue.open_failed]", {
          stage: loadStage,
          code: error instanceof Error ? error.message : "unknown_error",
        });
        toast.error(dialogueLoadToast(loadStage));
        navigate("/chats?tab=chats", { replace: true });
      } finally {
        setLoading((prev) => (roomId ? prev : false));
      }
    })();
  }, [loadCounterpart, loadGroupInfo, loadRoomMessages, navigate, profile?.id, roomId, searchParams, snapToLatestMessage]);

  useEffect(() => {
    if (!roomId) return;
    let refreshTimer: number | null = null;
    const reconcile = () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadRoomMessages(roomId);
      }, 80);
    };
    const roomChannel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => {
        reconcile();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") reconcile();
      });
    return () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(roomChannel);
    };
  }, [loadRoomMessages, roomId]);

  // Initial load of read receipts for my sent messages
  useEffect(() => {
    if (!roomId || !profile?.id || messages.length === 0) return;
    void refreshReadReceipts(messages);
    scheduleReadReceiptRefresh([140]);
  }, [messages, profile?.id, refreshReadReceipts, roomId, scheduleReadReceiptRefresh]);

  // Realtime subscription for blue tick — separate from message reload
  useEffect(() => {
    if (!roomId || !profile?.id) return;
    const readChannel = supabase
      .channel(`chat_dialogue_reads_${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: `chat_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as { message_id?: string; user_id?: string } | null;
        if (!row?.message_id || row.user_id === profile.id) return;
        const sentIds = new Set(messages.filter((message) => message.sender_id === profile.id).map((message) => message.id));
        if (!sentIds.has(row.message_id)) return;
        setReadMessageIds((prev) => new Set([...prev, row.message_id!]));
        scheduleReadReceiptRefresh([60]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(readChannel); };
  }, [messages, profile?.id, roomId, scheduleReadReceiptRefresh]);

  useEffect(() => {
    if (!roomId || !isGroup || joinedGroupHydrationRef.current !== roomId) return;
    let cancelled = false;
    const settle = async () => {
      try {
        const grouped = await loadGroupInfo(roomId);
        if (!grouped || cancelled) return;
        await loadRoomMessages(roomId);
        if (cancelled) return;
        await refreshReadReceipts();
      } catch {
        // best-effort settle refresh only
      }
    };
    const timerA = window.setTimeout(() => {
      void settle();
    }, 300);
    const timerB = window.setTimeout(() => {
      void settle();
      joinedGroupHydrationRef.current = null;
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timerA);
      window.clearTimeout(timerB);
    };
  }, [isGroup, loadGroupInfo, loadRoomMessages, refreshReadReceipts, roomId]);

  useEffect(() => {
    const urls = new Set<string>();
    if (activeComposerPreviewUrl) urls.add(activeComposerPreviewUrl);
    messages.forEach((message) => {
      const parsed = parseMessageContent(message.content);
      const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
      if (previewUrl) urls.add(previewUrl);
    });
    urls.forEach((url) => {
      if (linkPreviewByUrl[url]?.resolved || linkPreviewByUrl[url]?.failed || linkPreviewByUrl[url]?.loading) return;
      setLinkPreviewByUrl((prev) => ({ ...prev, [url]: { url, loading: true } }));
      void fetchExternalLinkPreview(url).then((preview) => {
        setLinkPreviewByUrl((prev) => ({ ...prev, [url]: preview }));
      });
    });
  }, [activeComposerPreviewUrl, linkPreviewByUrl, messages, parseMessageContent]);

  useEffect(() => {
    if (!composerFirstUrl) return;
    const preview = linkPreviewByUrl[composerFirstUrl];
    if (!preview?.resolved || preview.failed) return;
    setLockedPreviewUrl(composerFirstUrl);
    setChatInput((prev) => {
      if (!prev.includes(composerFirstUrl)) return prev;
      return stripExternalUrlFromText(prev, composerFirstUrl);
    });
  }, [composerFirstUrl, linkPreviewByUrl]);

  // For group chats: lazily fetch display names for any new sender not yet loaded
  useEffect(() => {
    if (!isGroup || messages.length === 0) return;
    const unknownIds = [
      ...new Set(
        messages
          .map((m) => m.sender_id)
          .filter((id) => id && id !== profile?.id && !fetchedSenderIdsRef.current.has(id))
      ),
    ];
    if (unknownIds.length === 0) return;
    unknownIds.forEach((id) => fetchedSenderIdsRef.current.add(id));
    void (async () => {
      const data = await fetchChatProfileSummaries(unknownIds);
      setSenderNames((prev) => {
        const next = { ...prev };
        data.forEach((profileRow) => {
          const id = String(profileRow.id || "").trim();
          const displayName = String(profileRow.display_name || "").trim();
          if (id && displayName) next[id] = displayName;
        });
        return next;
      });
    })();
  }, [isGroup, messages, profile?.id]);

  const sendMessage = useCallback(async () => {
    const cannotSend =
      blockState === "blocked_by_them" ||
      blockState === "blocked_by_me" ||
      isUnmatched ||
      chatDisabledBySafety;
    if (!roomId || !profile?.id || sending || cannotSend) return;
    const text = chatInput.trim();
    if (!text && composerUploads.length === 0 && !activeComposerPreviewUrl) return;
    setSending(true);
    setUploadingComposer(composerUploads.length > 0);
    const prevText = chatInput;
    const prevUploads = [...composerUploads];
    try {
      const attachments = await uploadFilesToPrivateChatAttachments(prevUploads);
      const payload = JSON.stringify({
        text,
        attachments,
        linkPreviewUrl: activeComposerPreviewUrl,
      });
      const { error } = await supabase.rpc("send_native_chat_message", {
        p_chat_id: roomId,
        p_content: payload,
      });
      if (error) throw error;
      setChatInput("");
      setComposerUploads([]);
      setLockedPreviewUrl(null);
      setDismissedPreviewUrls(new Set());
      if (composerFileInputRef.current) {
        composerFileInputRef.current.value = "";
      }
      await loadRoomMessages(roomId);
      scheduleReadReceiptRefresh([120, 700]);
    } catch {
      toast.error("Failed to send message");
      setChatInput(prevText);
      setComposerUploads(prevUploads);
    } finally {
      setSending(false);
      setUploadingComposer(false);
    }
  }, [activeComposerPreviewUrl, blockState, chatDisabledBySafety, chatInput, composerUploads, isUnmatched, loadRoomMessages, profile?.id, roomId, scheduleReadReceiptRefresh, sending, uploadFilesToPrivateChatAttachments]);

  const attachComposerMedia = useCallback(() => {
    const cannotAttach =
      blockState === "blocked_by_them" ||
      blockState === "blocked_by_me" ||
      isUnmatched ||
      sending;
    if (cannotAttach) return;
    composerFileInputRef.current?.click();
  }, [blockState, isUnmatched, sending]);

  const handleComposerMediaChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      appendComposerUploads(files);
    }
    event.target.value = "";
  }, [appendComposerUploads]);

  const openCounterpartProfile = useCallback(async () => {
    if (!counterpart?.id || counterpart.isTeamHuddle) return;
    await openUserProfile(counterpart.id, counterpart.displayName);
  }, [counterpart?.displayName, counterpart?.id, counterpart?.isTeamHuddle, openUserProfile]);

  const toggleGroupMute = useCallback(async () => {
    if (!roomId) return;
    const nextMuted = !groupMuted;
    setGroupMuted(nextMuted);
    try {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        params?: Record<string, unknown>
      ) => Promise<{ error: { message?: string } | null }>)("set_group_mute_state", {
        p_chat_id: roomId,
        p_muted: nextMuted,
      });
      if (error) throw error;
      toast.success(nextMuted ? "Group muted" : "Notifications on");
    } catch {
      setGroupMuted(!nextMuted);
      toast.error("Unable to update notifications right now.");
    }
  }, [groupMuted, roomId]);

  const handleBlockToggle = useCallback(async () => {
    if (!counterpart?.id) return;
    try {
      if (blockState === "blocked_by_me") {
        const { error } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
          "unblock_user",
          { p_blocked_id: counterpart.id }
        );
        if (error) throw error;
        setBlockState("none");
        toast.success("User unblocked");
      } else {
        const { error } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
          "block_user",
          { p_blocked_id: counterpart.id }
        );
        if (error) throw error;
        setBlockState("blocked_by_me");
        toast.success("User blocked");
      }
    } catch {
      toast.error("Unable to update block status right now.");
    } finally {
      setConfirmBlockOpen(false);
    }
  }, [blockState, counterpart?.id]);

  const handleUnmatch = useCallback(async () => {
    if (!profile?.id || !counterpart?.id || !roomId) return;
    try {
      const { error: rpcError } = await (supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
        "unmatch_user_one_sided",
        { p_other_user_id: counterpart.id }
      );
      if (rpcError) throw rpcError;
      toast.success("Unmatched. This conversation has been removed for you.");
      navigate("/chats?tab=chats", { replace: true });
    } catch {
      toast.error("Unable to unmatch right now.");
    } finally {
      setConfirmUnmatchOpen(false);
    }
  }, [counterpart?.id, navigate, profile?.id, roomId]);

  const loadGroupManageData = useCallback(async () => {
    if (!roomId || !profile?.id) return;
    setGroupManageLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_native_group_manage_snapshot", {
        p_chat_id: roomId,
      });
      if (error) throw error;
      const snapshot = data && typeof data === "object" ? data as Record<string, unknown> : {};
      const mapMember = (value: unknown) => {
        const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          id: String(row.id || row.user_id || "").trim(),
          name: String(row.name || row.display_name || "User").trim() || "User",
          avatarUrl: String(row.avatar_url || "").trim() || null,
        };
      };
      setGroupManageMembers((Array.isArray(snapshot.members) ? snapshot.members : []).map(mapMember).filter((member) => member.id));
      setGroupManageFriends((Array.isArray(snapshot.friends) ? snapshot.friends : []).map(mapMember).filter((member) => member.id));
    } catch {
      toast.error("Couldn't load group members.");
    } finally {
      setGroupManageLoading(false);
    }
  }, [roomId, profile?.id]);

  useEffect(() => {
    if (!groupManageOpen) {
      setGroupManageDescriptionEditing(false);
      setGroupManageDescriptionDraft("");
      return;
    }
    setGroupManageDescriptionEditing(false);
    setGroupManageDescriptionDraft(groupDescription || "");
  }, [groupDescription, groupManageOpen]);

  const openGroupInfoPanel = useCallback(() => {
    const media: string[] = [];
    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.content) as { attachments?: Attachment[] };
        if (Array.isArray(parsed.attachments)) {
          parsed.attachments
            .filter((item) => !String(item.mime || "").startsWith("video/"))
            .forEach((item) => {
              const url = resolveAttachmentUrl(item);
              if (url) media.push(url);
            });
        }
      } catch {
        // plain text rows
      }
    }
    setGroupMediaUrls(media);
    setGroupInfoOpen(true);
  }, [messages, resolveAttachmentUrl]);

  useEffect(() => {
    const paths = new Map<string, string>();
    messages.forEach((message) => {
      const parsed = parseMessageContent(message.content);
      parsed.attachments.forEach((attachment) => {
        const key = attachmentStorageKey(attachment);
        if (key && attachment.path) paths.set(key, attachment.path);
      });
    });
    const missing = Array.from(paths.entries()).filter(([key]) => !(key in signedAttachmentUrls));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async ([key, path]) => {
      const { data, error } = await supabase.storage.from("chat_attachments").createSignedUrl(path, 60 * 60 * 24 * 30);
      return [key, error ? null : data?.signedUrl || null] as const;
    })).then((rows) => {
      if (cancelled) return;
      setSignedAttachmentUrls((current) => {
        const next = { ...current };
        rows.forEach(([key, url]) => {
          next[key] = url;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentStorageKey, messages, parseMessageContent, signedAttachmentUrls]);

  if (loading) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Opening conversation...
        </div>
      </div>
    );
  }

  if (!roomId) return null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-white/88 backdrop-blur-md px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(returnToInbox)} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {isGroup ? (
            <>
              <button
                type="button"
                className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-card border border-border/30 flex items-center justify-center"
                onClick={openGroupInfoPanel}
                aria-label="Open group details"
              >
                {groupAvatarUrl ? (
                  <img src={groupAvatarUrl} alt={roomName} className="h-full w-full object-cover" />
                ) : (
                  <Users className="h-4 w-4 text-primary" />
                )}
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={openGroupInfoPanel}>
                <div className="truncate text-sm font-semibold text-brandText">{roomName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {groupMemberCount > 0 ? `${groupMemberCount} members` : "Group"}
                </div>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => void openCounterpartProfile()} className="shrink-0" disabled={counterpart?.isTeamHuddle === true}>
                <UserAvatar
                  avatarUrl={counterpart?.avatarUrl || null}
                  name={counterpart?.displayName || roomName}
                  isVerified={counterpart?.isVerified || false}
                  hasCar={counterpart?.hasCar || false}
                  size="md"
                  showBadges={true}
                />
              </button>
              <button onClick={() => void openCounterpartProfile()} className="min-w-0 flex-1 text-left" disabled={counterpart?.isTeamHuddle === true}>
                <div className="flex items-center gap-1 truncate text-sm font-semibold text-brandText">
                  {counterpart?.displayName || roomName}
                  {counterpart?.isVerified ? <BadgeCheck className="h-4 w-4 shrink-0 text-brandBlue" aria-label="Verified" /> : null}
                  {counterpart?.socialId && !counterpart?.isTeamHuddle ? <span className="ml-1 text-xs font-medium text-muted-foreground">@{counterpart.socialId}</span> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{counterpart?.availability || "Friend"}</div>
              </button>
            </>
          )}
          {isGroup ? (
            <button
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Group info"
              onClick={openGroupInfoPanel}
            >
              <MoreVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : counterpart?.isTeamHuddle ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full p-2 hover:bg-muted" aria-label="More">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setReportOpen(true)}>
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Report User
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setConfirmBlockOpen(true)}>
                  <UserX className="mr-2 h-4 w-4" />
                  {blockState === "blocked_by_me" ? "Unblock User" : "Block User"}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmUnmatchOpen(true)}>
                  <UserX className="mr-2 h-4 w-4" />
                  Unmatch
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div
        ref={messagesViewportRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3"
        onScroll={(event) => {
          const distanceToBottom = event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight;
          setShowScrollToBottom(distanceToBottom > 120);
          if (distanceToBottom <= 120) {
            markCurrentRoomSeen();
          }
          if (event.currentTarget.scrollTop < 56) {
            void loadOlderMessages();
          }
        }}
      >
        {isGroup && groupVisibility === "private" && groupRoomCode ? (
          <div className="sticky top-0 z-[2] mb-3 flex justify-center">
            <span className="rounded-full border border-[rgba(245,200,92,0.46)] bg-[rgba(245,200,92,0.18)] px-3 py-1 text-xs font-semibold text-[#8A6C1E] shadow-[0_8px_18px_rgba(245,200,92,0.18)]">
              {`Room Code: ${groupRoomCode}`}
            </span>
          </div>
        ) : null}
        {hasOlderMessages || loadingOlderMessages ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              className="rounded-full border border-border bg-white/82 px-3 py-1 text-xs font-medium text-[#6B7280] shadow-[0_8px_18px_rgba(66,73,101,0.08)] disabled:opacity-60"
              disabled={loadingOlderMessages}
              onClick={() => void loadOlderMessages()}
            >
              {loadingOlderMessages ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
        {blockState === "blocked_by_me" && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-[rgba(120,128,150,0.15)] px-3 py-1 text-xs font-medium text-[#8C93AA]">
              {`You've blocked ${counterpart?.displayName || "this user"}`}
            </span>
          </div>
        )}
        {blockState === "blocked_by_them" && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-[rgba(120,128,150,0.15)] px-3 py-1 text-xs font-medium text-[#8C93AA]">
              {`You're blocked by ${counterpart?.displayName || "user"}.`}
            </span>
          </div>
        )}
        {isUnmatched && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-[rgba(120,128,150,0.15)] px-3 py-1 text-xs font-medium text-[#8C93AA]">
              {unmatchState === "unmatched_by_me" ? "You've unmatched this user." : "You've been unmatched."}
            </span>
          </div>
        )}
        {!isGroup && latestStarIntro && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-[rgba(245,200,92,0.22)] px-3 py-1 text-xs font-semibold text-[#8A6C1E]">
              {latestStarIntro.senderId === profile?.id
                ? "Star sent! You’ve jumped to the front of the line."
                : `${counterpart?.displayName || "Someone"} used a Star to reach you. Say hi!`}
            </span>
          </div>
        )}
        <div className="space-y-2">
        {messages.map((message, index) => {
            const mine = message.sender_id === profile?.id;
            const parsed = parseMessageContent(message.content);
            const attachments = parsed.attachments;
            const share = parsed.share;
            const normalizedText = parsed.text.trim();
            const isStarIntro = !isGroup && isStarIntroKind(parsed.kind || null);
            const isStarFirstUserMessage =
              !isGroup &&
              firstStarUserMessageId != null &&
              message.id === firstStarUserMessageId;
            const isSystemMsg = parsed.kind === "system";
            const isMembershipHint =
              isGroup &&
              !isSystemMsg &&
              attachments.length === 0 &&
              normalizedText.length > 0 &&
              (/just joined the chat\.$/i.test(normalizedText) || /left the group\.$/i.test(normalizedText));
            const previous = index > 0 ? messages[index - 1] : null;
            const previousDay = previous?.created_at ? new Date(previous.created_at).toDateString() : "";
            const currentDay = message.created_at ? new Date(message.created_at).toDateString() : "";
            const showDivider = index === 0 || previousDay !== currentDay;
            const dividerLabel = formatDividerLabel(message.created_at);
            return (
              <div key={message.id}>
                {showDivider && dividerLabel ? (
                  <div className="my-2 flex items-center justify-center">
                    <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-[#8A90A8]">
                      {dividerLabel}
                    </span>
                  </div>
                ) : null}
                {isGroup && !mine && !isMembershipHint && !isSystemMsg && (
                  <div className="pl-1 mb-0.5 text-[11px] font-semibold text-muted-foreground">
                    {senderNames[message.sender_id] || ""}
                  </div>
                )}
                {isSystemMsg && !(isGroup && groupRoomCode && normalizedText.startsWith(`Room Code: ${groupRoomCode}`)) ? (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-[rgba(59,130,246,0.10)] px-3 py-1 text-[12px] font-medium text-[#3B82F6] text-center max-w-[80%]">
                      {normalizedText}
                    </span>
                  </div>
                ) : isSystemMsg ? null : isMembershipHint ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-[rgba(120,128,150,0.15)] px-3 py-1 text-xs font-medium text-[#8C93AA]">
                      {normalizedText}
                    </span>
                  </div>
                ) : isStarIntro ? (
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "w-fit max-w-[90%] rounded-xl border px-3 py-2 text-sm",
                        "border-[rgba(220,170,52,0.52)] bg-[rgba(245,200,92,0.26)] text-[#6F5716]"
                      )}
                    >
                      {mine ? "You sent a Star ⭐" : "New Star Connection ⭐"}
                    </div>
                  </div>
                ) : share ? (
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <SharedContentCard share={share} mine={mine} />
                  </div>
                ) : (
                  <>
                    <div
                      className={cn(
                        "w-fit max-w-[90%] rounded-xl border px-3 py-2 text-sm",
                        mine && "ml-auto",
                        isStarFirstUserMessage
                          ? "border-[rgba(220,170,52,0.52)] bg-[rgba(245,200,92,0.26)] text-[#6F5716]"
                          : mine
                            ? "border-[rgba(255,255,255,0.36)] bg-brandBlue text-white"
                            : "border-[rgba(163,168,190,0.35)] bg-muted text-brandText"
                      )}
                    >
                      {attachments.length > 0 && (
                        <div className={cn("mb-2 grid grid-cols-2 gap-2", attachments.length === 1 && "grid-cols-1")}>
                          {attachments.map((attachment, idx) => (
                            (() => {
                              const attachmentUrl = resolveAttachmentUrl(attachment);
                              if (!attachmentUrl) {
                                return (
                                  <div key={`${message.id}-att-${idx}`} className="flex h-36 items-center justify-center rounded-lg border border-white/30 bg-black/10 px-3 text-center text-xs opacity-80">
                                    Attachment unavailable
                                  </div>
                                );
                              }
                              return (
                                <a key={`${message.id}-att-${idx}`} href={attachmentUrl} target="_blank" rel="noreferrer">
                                  {attachment.mime.startsWith("video/") ? (
                                    <video src={attachmentUrl} controls className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                                  ) : (
                                    <img src={attachmentUrl} alt={attachment.name} className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                                  )}
                                </a>
                              );
                            })()
                          ))}
                        </div>
                      )}
                      {(() => {
                        const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(parsed.text);
                        const preview = previewUrl ? linkPreviewByUrl[previewUrl] || null : null;
                        const displayText = previewUrl ? stripExternalUrlFromText(parsed.text, previewUrl) : parsed.text;
                        return (
                          <>
                            {previewUrl ? (
                              <ExternalLinkPreviewCard
                                url={previewUrl}
                                preview={preview}
                                className={attachments.length > 0 ? "mt-1" : undefined}
                              />
                            ) : null}
                            {displayText ? <div className={cn("whitespace-pre-wrap break-words", previewUrl && "mt-2")}>{displayText}</div> : null}
                          </>
                        );
                      })()}
                    </div>
                    <div className={cn("mt-1 flex items-center gap-1 text-[11px] text-[#9AA0B5]", mine ? "justify-end pr-1" : "justify-start pl-1")}>
                      <span>{formatMessageTime(message.created_at)}</span>
                      {mine && (
                        <span
                          className={cn(
                            "font-semibold leading-none",
                            readMessageIds.has(message.id) ? "text-brandBlue" : "text-[#9AA0B5]"
                          )}
                          aria-label={readMessageIds.has(message.id) ? "read" : "sent"}
                        >
                          {readMessageIds.has(message.id) ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {showScrollToBottom ? (
          <button
            type="button"
            onClick={() => {
              snapToLatestMessage();
              markCurrentRoomSeen();
              setShowScrollToBottom(false);
            }}
            className="sticky bottom-3 ml-auto mt-3 flex items-center gap-1 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs text-brandText shadow-sm"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Latest
          </button>
        ) : null}
      </div>

      <div className="border-t border-border bg-white/92 px-3 py-2 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+16px)]">
        {activeComposerPreviewUrl ? (
          <ExternalLinkPreviewCard
            url={activeComposerPreviewUrl}
            preview={composerPreview}
            className="mb-2"
            onRemove={() => {
              setDismissedPreviewUrls((prev) => {
                const next = new Set(prev);
                next.add(activeComposerPreviewUrl);
                return next;
              });
              setLockedPreviewUrl((prev) => (prev === activeComposerPreviewUrl ? null : prev));
            }}
          />
        ) : null}
        {composerUploads.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {composerPreviewUrls.map(({ key, file, url }, idx) => (
              <div key={key} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                {file.type.startsWith("video/") ? (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">Video</div>
                ) : (
                  <img src={url} alt={file.name} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setComposerUploads((prev) => prev.filter((_, currentIndex) => currentIndex !== idx));
                  }}
                  className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {chatDisabledBySafety ? (
            <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Your messaging access is currently restricted due to recent account activity that does not meet our community safety standards.
              </span>
            </div>
          ) : (
          <div className="flex flex-1 items-center gap-2 rounded-[12px] bg-[rgba(255,255,255,0.72)] px-1.5 shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent disabled:opacity-45"
            onClick={() => {
              attachComposerMedia();
            }}
            aria-label="Upload media"
            disabled={
              blockState === "blocked_by_them" ||
              blockState === "blocked_by_me" ||
              isUnmatched ||
              sending
            }
          >
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          </button>
          <input
            ref={composerFileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleComposerMediaChange}
          />
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder=""
            style={{ fontSize: "16px" }}
            className="flex-1 h-10 border-0 bg-transparent px-1 text-sm text-[var(--text-primary,#424965)] outline-none focus:outline-none focus:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
            disabled={
              blockState === "blocked_by_them" ||
              blockState === "blocked_by_me" ||
              isUnmatched ||
              sending
            }
          />
          </div>
          )}
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={
              sending ||
              uploadingComposer ||
              chatDisabledBySafety ||
              blockState === "blocked_by_them" ||
              blockState === "blocked_by_me" ||
              isUnmatched ||
              (!chatInput.trim() && composerUploads.length === 0 && !activeComposerPreviewUrl)
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brandBlue text-white disabled:opacity-45"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {profileSheetOpen && profileSheetUserId ? (
        <ProfileShareCard
          profileId={profileSheetUserId}
          onClose={() => {
            setProfileSheetOpen(false);
            setProfileSheetUserId(null);
          }}
        />
      ) : null}

      <Dialog open={confirmUnmatchOpen} onOpenChange={setConfirmUnmatchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unmatch user</DialogTitle>
            <DialogDescription>This conversation will be deleted permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="h-10 rounded-full border px-4 text-sm" onClick={() => setConfirmUnmatchOpen(false)}>Cancel</button>
            <button className="h-10 rounded-full bg-destructive px-4 text-sm text-white" onClick={() => void handleUnmatch()}>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmBlockOpen} onOpenChange={setConfirmBlockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {blockState === "blocked_by_me"
                ? `Unblock ${counterpart?.displayName ?? "this user"}?`
                : `Block ${counterpart?.displayName ?? "this user"}?`}
            </DialogTitle>
            <DialogDescription>
              {blockState === "blocked_by_me"
                ? "Allow this user to send you messages again?"
                : "You will no longer see their posts or alerts, and they won't be able to interact with you."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="h-10 rounded-full border px-4 text-sm" onClick={() => setConfirmBlockOpen(false)}>Cancel</button>
            <button
              className={`h-10 rounded-full px-4 text-sm text-white ${blockState === "blocked_by_me" ? "bg-brandBlue" : "bg-destructive"}`}
              onClick={() => void handleBlockToggle()}
            >
              {blockState === "blocked_by_me" ? "Unblock" : "Block"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetUserId={counterpart?.id ?? null}
        targetName={counterpart?.displayName ?? "User"}
        source={isGroup ? "Group Chat" : "Chat"}
      />

      {/* ── Group Info Sheet (WhatsApp-style) ── */}
      <Sheet open={groupInfoOpen} onOpenChange={setGroupInfoOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[calc(100svh-env(safe-area-inset-bottom,0px)-8px)] flex flex-col overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{roomName}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <GroupDetailsPanel
              name={roomName}
              avatarUrl={groupAvatarUrl}
              memberCount={groupMemberCount}
              subtitle={groupLocationLabel ? `${groupMemberCount} members · ${groupLocationLabel}` : `${groupMemberCount} members`}
              description={groupDescription}
              mediaUrls={groupMediaUrls}
              chatId={roomId ?? undefined}
              ownerUserId={profile?.id ?? null}
              createdBy={groupCreatedBy}
              onAvatarUpdated={(newUrl) => setGroupAvatarUrl(newUrl)}
              actions={[
                {
                  key: "mute",
                  label: groupMuted ? "Unmute notifications" : "Mute notifications",
                  icon: groupMuted
                    ? <BellOff className="h-5 w-5 text-muted-foreground" />
                    : <Bell className="h-5 w-5 text-muted-foreground" />,
                  onClick: () => { void toggleGroupMute(); },
                },
                ...(groupIsAdmin
                  ? [{
                      key: "manage",
                      label: "Manage Group",
                      icon: <Settings className="h-5 w-5 text-muted-foreground" />,
                      onClick: () => {
                        setGroupInfoOpen(false);
                        setGroupManageReturnToInfo(true);
                        void loadGroupManageData();
                        setGroupManageOpen(true);
                      },
                    }]
                  : []),
                {
                  key: "report",
                  label: "Report group",
                  icon: <ShieldAlert className="h-5 w-5 text-muted-foreground" />,
                  onClick: () => {
                    setGroupInfoOpen(false);
                    setReportOpen(true);
                  },
                },
                ...(groupIsAdmin
                  ? [{
                      key: "remove-group",
                      label: "Remove group",
                      icon: <LogOut className="h-5 w-5 text-red-500" />,
                      destructive: true,
                      onClick: () => {
                        setGroupInfoOpen(false);
                        setConfirmRemoveGroupOpen(true);
                      },
                    }]
                  : [{
                      key: "leave",
                      label: "Leave group",
                      icon: <LogOut className="h-5 w-5 text-red-500" />,
                      destructive: true,
                      onClick: () => {
                        setGroupInfoOpen(false);
                        setConfirmLeaveOpen(true);
                      },
                    }]),
              ]}
            />
          </div>{/* end scrollable body */}
        </SheetContent>
      </Sheet>

      {/* ── Manager Group Sheet (legacy inline path) ── */}
      <Sheet open={groupManageOpen} onOpenChange={(v) => { setGroupManageOpen(v); if (!v) { setGroupManageSearch(""); setGroupManageReturnToInfo(false); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[calc(100svh-env(safe-area-inset-bottom,0px)-8px)] flex flex-col overflow-hidden">
          <SheetHeader className="pb-3 shrink-0">
            <div className="flex items-center gap-2">
              {groupManageReturnToInfo ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white/80"
                  onClick={() => {
                    setGroupManageOpen(false);
                    setGroupManageSearch("");
                    setGroupManageReturnToInfo(false);
                    setGroupInfoOpen(true);
                  }}
                  aria-label="Back to group details"
                >
                  <ChevronLeft className="h-4 w-4 text-brandText/70" />
                </button>
              ) : null}
              <div>
                <SheetTitle className="text-left">Manage Group</SheetTitle>
                <p className="mt-1 text-left text-sm text-muted-foreground">Edit photo, members, and group settings.</p>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-5">
            {groupManageLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {groupAvatarUrl ? (
                    <img src={groupAvatarUrl} alt={roomName} className="h-14 w-14 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold text-brandText">{roomName || "Group"}</div>
                    <div className="text-[10px] text-muted-foreground">{groupMemberCount} members</div>
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file || !roomId || !profile?.id) return;
                        setGroupManageImageUploading(true);
                        try {
                          const { default: compress } = await import("browser-image-compression");
                          const compressed = await compress(file, {
                            maxSizeMB: 0.5,
                            maxWidthOrHeight: 800,
                            useWebWorker: true,
                          });
                          const ext = compressed.name.split(".").pop() || "jpg";
                          const path = `${profile.id}/groups/${roomId}/${Date.now()}.${ext}`;
                          const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true });
                          if (uploadErr) throw uploadErr;
                          const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
                          const row = await updateGroupChatMetadata({
                            chatId: roomId,
                            avatarUrl: pub.publicUrl,
                            updateAvatar: true,
                          });
                          setGroupAvatarUrl(row.avatar_url || null);
                          setGroupDescription(row.description || "");
                          setGroupManageDescriptionDraft(row.description || "");
                          toast.success("Group image updated");
                        } catch {
                          toast.error("Couldn't update group image.");
                        } finally {
                          setGroupManageImageUploading(false);
                          event.target.value = "";
                        }
                      }}
                    />
                    <span className="inline-flex min-h-9 items-center rounded-full bg-white px-4 text-sm font-semibold text-brandText shadow-[0_8px_24px_rgba(66,73,101,0.12)]">
                      {groupManageImageUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Change Image
                    </span>
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-brandText/70">Description</div>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8C93AA] transition-colors hover:bg-muted/50"
                      disabled={groupManageDescriptionSaving}
                      onClick={async () => {
                        if (!groupManageDescriptionEditing) {
                          setGroupManageDescriptionEditing(true);
                          return;
                        }
                        if (!roomId) return;
                        setGroupManageDescriptionSaving(true);
                        try {
                          const row = await updateGroupChatMetadata({
                            chatId: roomId,
                            description: groupManageDescriptionDraft.trim() || null,
                            updateDescription: true,
                          });
                          setGroupDescription(row.description || "");
                          setGroupManageDescriptionDraft(row.description || "");
                          setGroupManageDescriptionEditing(false);
                          toast.success("Group description updated");
                        } catch {
                          toast.error("Couldn't save group description.");
                        } finally {
                          setGroupManageDescriptionSaving(false);
                        }
                      }}
                      aria-label={groupManageDescriptionEditing ? "Save description" : "Edit description"}
                    >
                      {groupManageDescriptionSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : groupManageDescriptionEditing ? (
                        <Save className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {groupManageDescriptionEditing ? (
                    <div className="form-field-rest min-h-[92px] py-3">
                      <textarea
                        value={groupManageDescriptionDraft}
                        onChange={(event) => setGroupManageDescriptionDraft(event.target.value)}
                        className="field-input-core resize-none px-0 text-sm leading-relaxed"
                        rows={4}
                        placeholder="Tell members what this group is about."
                      />
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-white/60 bg-white px-4 py-3 text-sm leading-relaxed text-brandText shadow-[0_10px_24px_rgba(66,73,101,0.08)]">
                      {groupManageDescriptionDraft.trim() || "No description yet."}
                    </div>
                  )}
                </div>

                {/* Current members */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Members ({groupManageMembers.length})</p>
                  <div className="space-y-2">
                    {groupManageMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-1">
                        <button
                          type="button"
                          className="flex items-center gap-2"
                          onClick={() => void openUserProfile(m.id, m.name)}
                        >
                          <UserAvatar avatarUrl={m.avatarUrl} name={m.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                          <span className="text-sm text-brandText">{m.id === profile?.id ? `${m.name} (You)` : m.name}</span>
                        </button>
                        {m.id !== profile?.id && (
                          <button
                            onClick={async () => {
                              if (!isVerifiedProfile(profile)) {
                                setGroupVerifyGateOpen(true);
                                return;
                              }
                              try {
                                const { error } = await supabase.rpc("remove_group_member", {
                                  p_chat_id: roomId!,
                                  p_user_id: m.id,
                                });
                                if (error) throw error;
                                setGroupManageMembers((prev) => prev.filter((x) => x.id !== m.id));
                                setGroupMemberCount((prev) => Math.max(0, prev - 1));
                                void loadGroupManageData();
                                toast.success(`${m.name} removed`);
                              } catch {
                                toast.error("Couldn't remove member.");
                              }
                            }}
                            className="text-[10px] font-medium text-red-500 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add friends */}
                {groupManageFriends.length > 0 && (() => {
                  const filtered = groupManageSearch.trim()
                    ? groupManageFriends.filter((u) => u.name.toLowerCase().includes(groupManageSearch.toLowerCase()))
                    : groupManageFriends;
                  return (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Add Members</p>
                      {groupManageFriends.length > 4 && (
                        <div className="form-field-rest relative flex items-center mb-2">
                          <input
                            value={groupManageSearch}
                            onChange={(e) => setGroupManageSearch(e.target.value)}
                            placeholder="Search friends…"
                            className="field-input-core text-sm h-9"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        {filtered.map((u) => (
                          <div key={u.id} className="flex items-center justify-between py-1">
                            <button
                              type="button"
                              className="flex items-center gap-2"
                              onClick={() => void openUserProfile(u.id, u.name)}
                            >
                              <UserAvatar avatarUrl={u.avatarUrl} name={u.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                              <span className="text-sm text-brandText">{u.name}</span>
                            </button>
                            <button
                              onClick={async () => {
                                if (!isVerifiedProfile(profile)) {
                                  setGroupVerifyGateOpen(true);
                                  return;
                                }
                                if (!profile?.id || !roomId) return;
                                try {
                                  const { error } = await supabase
                                    .from("group_chat_invites")
                                    .upsert(
                                      {
                                        chat_id: roomId,
                                        chat_name: roomName,
                                        inviter_user_id: profile.id,
                                        invitee_user_id: u.id,
                                        status: "pending",
                                      },
                                      { onConflict: "chat_id,invitee_user_id", ignoreDuplicates: false }
                                    );
                                  if (error) throw error;
                                  setGroupManageFriends((prev) => prev.filter((f) => f.id !== u.id));
                                  void loadGroupManageData();
                                  toast.success(`${u.name} invited`);
                                  const inviterName = (profile as unknown as { display_name?: string })?.display_name || "Someone";
                                  void supabase.rpc("enqueue_notification", {
                                    p_user_id: u.id,
                                    p_category: "chats",
                                    p_kind: "group_invite",
                                    p_title: "Group invite",
                                    p_body: `${inviterName} added you to a group 🐾`,
                                    p_href: "/chats?tab=groups",
                                    p_data: { chat_id: roomId, chat_name: roomName, inviter_name: inviterName },
                                  });
                                } catch {
                                  toast.error("Couldn't add member.");
                                }
                              }}
                              className="h-7 w-7 flex items-center justify-center rounded-full bg-brandBlue/10 hover:bg-brandBlue/20 transition-colors"
                              aria-label="Add member"
                            >
                              <UserPlus className="h-3.5 w-3.5 text-brandBlue" />
                            </button>
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">No friends found</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Verify gate dialog */}
      <Dialog open={groupVerifyGateOpen} onOpenChange={setGroupVerifyGateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Identity verification required</DialogTitle>
            <DialogDescription>Complete identity verification to add or remove group members.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <button className="flex-1 h-10 rounded-full border px-4 text-sm" onClick={() => setGroupVerifyGateOpen(false)}>Not now</button>
            <button
              className="flex-1 h-10 rounded-full bg-brandBlue px-4 text-sm font-semibold text-white"
              onClick={() => { setGroupVerifyGateOpen(false); navigate("/verify-identity"); }}
            >
              Verify now
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave group confirmation */}
      <Dialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave group?</DialogTitle>
            <DialogDescription>
              You'll no longer see new messages in this group.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <button
              className="flex-1 h-10 rounded-full border px-4 text-sm"
              onClick={() => setConfirmLeaveOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex-1 h-10 rounded-full bg-red-500 px-4 text-sm font-semibold text-white"
              onClick={async () => {
                if (!profile?.id || !roomId) return;
                setConfirmLeaveOpen(false);
                try {
                  const displayName = (profile as unknown as { display_name?: string })?.display_name || "Someone";
                  const { error: sendError } = await supabase.rpc("send_native_chat_message", {
                    p_chat_id: roomId,
                    p_content: `${displayName} left the group.`,
                  });
                  if (sendError) throw sendError;
                  const { error: removeError } = await supabase.rpc("remove_native_group_member", {
                    p_chat_id: roomId,
                    p_user_id: profile.id,
                  });
                  if (removeError) throw removeError;
                  setGroupMemberCount((prev) => Math.max(0, prev - 1));
                  navigate("/chats?tab=groups", { replace: true });
                } catch {
                  toast.error("Unable to leave group right now.");
                }
              }}
            >
              Leave
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemoveGroupOpen} onOpenChange={setConfirmRemoveGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove group?</DialogTitle>
            <DialogDescription>
              This group and all its content will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <button
              className="flex-1 h-10 rounded-full border px-4 text-sm"
              onClick={() => setConfirmRemoveGroupOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex-1 h-10 rounded-full bg-red-500 px-4 text-sm font-semibold text-white"
              onClick={async () => {
                if (!roomId) return;
                setConfirmRemoveGroupOpen(false);
                try {
                  const { error } = await (supabase.rpc as unknown as (
                    fn: string,
                    params?: Record<string, unknown>,
                  ) => Promise<{ error: { message?: string } | null }>)("remove_group_chat", {
                    p_chat_id: roomId,
                  });
                  if (error) throw error;
                  navigate("/chats?tab=groups", { replace: true });
                } catch {
                  toast.error("Unable to remove group right now.");
                }
              }}
            >
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatDialogue;
