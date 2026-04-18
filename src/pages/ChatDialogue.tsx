import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, BadgeCheck, ChevronLeft, ImagePlus, Loader2, MoreVertical, SendHorizontal, Settings, ShieldAlert, UserX, Users, Bell, BellOff, UserPlus, LogOut, Image as ImageIcon, Lock, Pencil, Save } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureDirectChatRoom } from "@/lib/chatRooms";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import { isStarIntroKind, parseStarChatContent } from "@/lib/starChat";
import { parseChatShareMessage, type ShareModel } from "@/lib/shareModel";
import { SharedContentCard } from "@/components/chat/SharedContentCard";
import { GroupDetailsPanel } from "@/components/chat/GroupDetailsPanel";
import { ReportModal } from "@/components/moderation/ReportModal";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import { updateGroupChatMetadata } from "@/lib/groupChats";
import {
  TEAM_HUDDLE_AVAILABILITY,
  TEAM_HUDDLE_DISPLAY_NAME,
  TEAM_HUDDLE_USER_ID,
  isTeamHuddleIdentity,
  resolveTeamHuddleAvatar,
} from "@/lib/teamHuddleIdentity";

type ChatMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type Attachment = {
  url: string;
  mime: string;
  name: string;
};

type ParsedMessage = {
  text: string;
  attachments: Attachment[];
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
type UnmatchState = "none" | "unmatched_by_them";
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
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [profileSheetData, setProfileSheetData] = useState<Record<string, unknown> | null>(null);
  const [confirmUnmatchOpen, setConfirmUnmatchOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [composerUploads, setComposerUploads] = useState<File[]>([]);
  const [uploadingComposer, setUploadingComposer] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
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

  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const canSendVideo = tier === "gold";
  const chatDisabledBySafety = isActive("chat_disabled");
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
      const parsed = JSON.parse(content) as { text?: string; attachments?: Attachment[]; kind?: string };
      if (parsed && typeof parsed === "object") {
        // System messages: {"kind":"system","text":"..."}
        if (parsed.kind === "system") {
          return { text: String(parsed.text || ""), attachments: [], share: null, kind: "system" };
        }
        if (Array.isArray(parsed.attachments)) {
          return {
            text: String(parsed.text || ""),
            attachments: parsed.attachments
              .filter((item) => item && typeof item.url === "string" && item.url)
              .map((item) => ({
                url: String(item.url),
                mime: String(item.mime || ""),
                name: String(item.name || "media"),
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
    if (!profile?.id || readFlushInFlightRef.current) return;
    const pendingIds = Array.from(pendingReadIdsRef.current);
    if (pendingIds.length === 0) return;

    pendingReadIdsRef.current = new Set();
    readFlushInFlightRef.current = true;

    const { error: upsertError } = await supabase
      .from("message_reads")
      .upsert(
        pendingIds.map((messageId) => ({
          message_id: messageId,
          user_id: profile.id,
          read_at: new Date().toISOString(),
        })),
        { onConflict: "message_id,user_id" },
      );

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
  }, [profile?.id]);

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
    const { data: chatRow } = await supabase
      .from("chats")
      .select("id, name, type, avatar_url, description, visibility, room_code, location_label, created_by")
      .eq("id", nextRoomId)
      .maybeSingle();
    const row = chatRow as {
      name?: string | null;
      type?: string;
      avatar_url?: string | null;
      description?: string | null;
      visibility?: "public" | "private" | null;
      room_code?: string | null;
      location_label?: string | null;
      created_by?: string | null;
    } | null;
    if (!row || row.type !== "group") return false;

    setIsGroup(true);
    setGroupAvatarUrl(row.avatar_url || null);
    setRoomName(row.name || "Group");
    setGroupDescription(String(row.description || ""));
    setGroupVisibility(row.visibility || null);
    setGroupRoomCode(row.room_code || null);
    setGroupLocationLabel(row.location_label || null);
    setGroupIsAdmin((row.created_by || null) === profile?.id);

    try {
      const [{ data: members }, { data: participantRow }] = await Promise.all([
        supabase
          .from("chat_room_members")
          .select("user_id")
          .eq("chat_id", nextRoomId),
        profile?.id
          ? supabase
              .from("chat_participants")
              .select("is_muted, role")
              .eq("chat_id", nextRoomId)
              .eq("user_id", profile.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const memberIds = ((members || []) as { user_id: string }[]).map((m) => m.user_id).filter(Boolean);
      setGroupMemberCount(memberIds.length);
      setGroupMuted(Boolean((participantRow as { is_muted?: boolean } | null)?.is_muted));
      setGroupIsAdmin(
        (row.created_by || null) === profile?.id ||
        String((participantRow as { role?: string } | null)?.role || "").toLowerCase() === "admin"
      );

      if (memberIds.length === 0) return;
      memberIds.forEach((id) => fetchedSenderIdsRef.current.add(id));
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberIds);
      const nameMap: Record<string, string> = {};
      ((memberProfiles || []) as { id: string; display_name?: string | null }[]).forEach((p) => {
        if (p.id && p.display_name) nameMap[p.id] = p.display_name;
      });
      setSenderNames(nameMap);
    } catch (error) {
      console.warn("[ChatDialogue] load group details failed", error);
    }

    return true;
  }, [profile?.id]);

  const loadRoomMessages = useCallback(async (nextRoomId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("chat_id", nextRoomId)
      .order("created_at", { ascending: false })
      .limit(INITIAL_MESSAGE_LOAD_SIZE + 1);
    if (error) throw error;
    const rows = (data || []) as ChatMessage[];
    const nextMessages = rows.slice(0, INITIAL_MESSAGE_LOAD_SIZE).reverse();
    setHasOlderMessages(rows.length > INITIAL_MESSAGE_LOAD_SIZE);
    setMessages(nextMessages);
    void markMessagesAsRead(nextMessages);
  }, [markMessagesAsRead]);

  useLayoutEffect(() => {
    if (!pendingInitialScrollRef.current || loading) return;
    pendingInitialScrollRef.current = false;
    snapToLatestMessage();
  }, [loading, messages, snapToLatestMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || loadingOlderMessages || !hasOlderMessages || messages.length === 0) return;
    const oldestCreatedAt = messages[0]?.created_at;
    if (!oldestCreatedAt) return;
    setLoadingOlderMessages(true);
    const viewport = messagesViewportRef.current;
    const previousHeight = viewport?.scrollHeight || 0;
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, sender_id, content, created_at")
        .eq("chat_id", roomId)
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(OLDER_MESSAGE_PAGE_SIZE + 1);
      if (error) throw error;
      const rows = (data || []) as ChatMessage[];
      const olderMessages = rows.slice(0, OLDER_MESSAGE_PAGE_SIZE).reverse();
      setHasOlderMessages(rows.length > OLDER_MESSAGE_PAGE_SIZE);
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
    const { data } = await supabase
      .from("message_reads")
      .select("message_id")
      .in("message_id", myMessageIds)
      .neq("user_id", profile.id);
    if (data) {
      setReadMessageIds(new Set((data as { message_id: string }[]).map((row) => row.message_id)));
    }
  }, [messages, profile?.id, roomId]);

  const openUserProfile = useCallback(async (userId: string, fallbackDisplayName: string) => {
    if (!userId || isTeamHuddleIdentity(fallbackDisplayName, null)) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfileSheetData((data as Record<string, unknown> | null) ?? null);
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
    let counterpartId = hintUserId && hintUserId !== profile.id ? hintUserId : null;
    if (!counterpartId) {
      const { data: members, error: membersError } = await supabase
        .from("chat_room_members")
        .select("user_id")
        .eq("chat_id", nextRoomId);
      if (membersError) throw membersError;
      counterpartId = (members || [])
        .map((row: { user_id: string }) => row.user_id)
        .find((id: string) => id !== profile.id) || null;
    }
    if (!counterpartId) return;

    const privateSelectPrimary = "id, display_name, social_id, avatar_url, availability_status, verification_status, is_verified, has_car";
    const [
      privateProfileResult,
      publicProfileResult,
      blocksResult,
      unmatchesResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(privateSelectPrimary)
        .eq("id", counterpartId)
        .maybeSingle(),
      supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url, availability_status, user_role, has_car")
        .eq("id", counterpartId)
        .maybeSingle(),
      supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`and(blocker_id.eq.${profile.id},blocked_id.eq.${counterpartId}),and(blocker_id.eq.${counterpartId},blocked_id.eq.${profile.id})`)
        .limit(1),
      supabase
        .from("user_unmatches")
        .select("actor_id, target_id")
        .or(`and(actor_id.eq.${counterpartId},target_id.eq.${profile.id}),and(actor_id.eq.${profile.id},target_id.eq.${counterpartId})`)
        .limit(1),
    ]);

    const profileRow =
      ((privateProfileResult.data as Record<string, unknown> | null) ?? null)
      || ((publicProfileResult.data as Record<string, unknown> | null) ?? null);

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
      isVerified: isOfficialTeamHuddle ? true : profileRow?.is_verified === true,
      hasCar: Boolean(profileRow?.has_car),
      isTeamHuddle: isOfficialTeamHuddle,
    });

    const blocks = blocksResult.data;
    const relation = Array.isArray(blocks) && blocks.length > 0 ? blocks[0] : null;
    if (relation?.blocker_id === counterpartId && relation?.blocked_id === profile.id) {
      setBlockState("blocked_by_them");
    } else if (relation?.blocker_id === profile.id && relation?.blocked_id === counterpartId) {
      setBlockState("blocked_by_me");
    } else {
      setBlockState("none");
    }

    const unmatches = unmatchesResult.data;
    const unmatchRelation = Array.isArray(unmatches) && unmatches.length > 0 ? unmatches[0] : null;
    if (unmatchRelation?.actor_id === counterpartId && unmatchRelation?.target_id === profile.id) {
      setUnmatchState("unmatched_by_them");
    } else {
      setUnmatchState("none");
    }
  }, [profile?.id]);

  const uploadFilesToNotices = useCallback(async (files: File[], folder: string): Promise<Attachment[]> => {
    if (!profile?.id || !roomId || files.length === 0) return [];
    const uploaded: Attachment[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      // notices bucket policy expects first segment to be auth uid
      const path = `${profile.id}/${folder}/${roomId}/${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("notices").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) {
        console.error("[chat.upload.failed]", { path, message: uploadError.message });
        throw uploadError;
      }
      const { data: publicData } = supabase.storage.from("notices").getPublicUrl(path);
      uploaded.push({
        url: publicData.publicUrl,
        mime: file.type || "",
        name: file.name || `file-${i + 1}`,
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
      navigate("/auth", { replace: true });
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
    if (room) {
      void (async () => {
        try {
          setRoomId(room);
          const { data: membership } = await supabase
            .from("chat_room_members")
            .select("chat_id")
            .eq("chat_id", room)
            .eq("user_id", profile.id)
            .maybeSingle();

          if (membership) {
            const grouped = await loadGroupInfo(room);
            let directTargetId = hintedUserId && hintedUserId !== profile.id ? hintedUserId : null;
            if (!grouped && !directTargetId) {
              const { data: directMembers } = await supabase
                .from("chat_room_members")
                .select("user_id")
                .eq("chat_id", room);
              directTargetId =
                ((directMembers || []) as Array<{ user_id?: string | null }>)
                  .map((member) => String(member.user_id || "").trim())
                  .find((userId) => Boolean(userId) && userId !== profile.id) || null;
            }
            const nextRoomId = room;
            await loadRoomMessages(nextRoomId);
            if (!grouped) {
              await loadCounterpart(nextRoomId, name, directTargetId);
            } else if (joinedGroup) {
              joinedGroupHydrationRef.current = nextRoomId;
            }
            pendingInitialScrollRef.current = true;
            setLoading(false);
            return;
          }

          let fallbackTargetId = hintedUserId && hintedUserId !== profile.id ? hintedUserId : null;
          if (!fallbackTargetId) {
            const { data: matchRow } = await supabase
              .from("matches")
              .select("user1_id,user2_id")
              .eq("chat_id", room)
              .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
              .maybeSingle();
            if (matchRow) {
              const row = matchRow as { user1_id?: string | null; user2_id?: string | null };
              fallbackTargetId = row.user1_id === profile.id ? (row.user2_id || null) : (row.user1_id || null);
            }
          }

          if (!fallbackTargetId || fallbackTargetId === profile.id) {
            throw new Error("room_not_accessible");
          }

          const nextRoomId = await ensureDirectChatRoom(supabase, profile.id, fallbackTargetId, name);
          setRoomId(nextRoomId);
          const grouped2 = await loadGroupInfo(nextRoomId);
          await loadRoomMessages(nextRoomId);
          if (!grouped2) {
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
        } catch {
          toast.error("Unable to load messages right now.");
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
      try {
        const directRoomId = await ensureDirectChatRoom(supabase, profile.id, targetUserId, targetName);
        setRoomId(directRoomId);
        await loadRoomMessages(directRoomId);
        await loadCounterpart(directRoomId, targetName, targetUserId);
        pendingInitialScrollRef.current = true;
        setLoading(false);
      } catch {
        toast.error("Unable to open conversation right now.");
        navigate("/chats?tab=chats", { replace: true });
      } finally {
        setLoading((prev) => (roomId ? prev : false));
      }
    })();
  }, [loadCounterpart, loadGroupInfo, loadRoomMessages, navigate, profile?.id, roomId, searchParams, snapToLatestMessage]);

  useEffect(() => {
    if (!roomId) return;
    const roomChannel = supabase
      .channel(`chat_dialogue_room_${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as ChatMessage | null;
        if (!row?.id) return;
        setMessages((prev) => {
          if (prev.some((message) => message.id === row.id)) return prev;
          return [...prev, row];
        });
        void markMessagesAsRead([row]);
        requestAnimationFrame(() => {
          const viewport = messagesViewportRef.current;
          if (!viewport) return;
          const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
          if (nearBottom) viewport.scrollTop = viewport.scrollHeight;
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [markMessagesAsRead, roomId]);

  // Initial load of read receipts for my sent messages
  useEffect(() => {
    if (!roomId || !profile?.id || messages.length === 0) return;
    void refreshReadReceipts(messages);
  }, [messages, profile?.id, refreshReadReceipts, roomId]);

  // Realtime subscription for blue tick — separate from message reload
  useEffect(() => {
    if (!roomId || !profile?.id) return;
    const readChannel = supabase
      .channel(`chat_dialogue_reads_${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const row = payload.new as { message_id?: string; user_id?: string } | null;
        if (!row?.message_id || row.user_id === profile.id) return;
        setReadMessageIds((prev) => new Set([...prev, row.message_id!]));
      })
      .subscribe();
    return () => { void supabase.removeChannel(readChannel); };
  }, [roomId, profile?.id]);

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
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", unknownIds);
      if (!data) return;
      setSenderNames((prev) => {
        const next = { ...prev };
        (data as { id: string; display_name?: string | null }[]).forEach((p) => {
          if (p.id && p.display_name) next[p.id] = p.display_name;
        });
        return next;
      });
    })();
  }, [isGroup, messages, profile?.id]);

  const sendMessage = useCallback(async () => {
    const cannotSend =
      blockState === "blocked_by_them" ||
      blockState === "blocked_by_me" ||
      unmatchState === "unmatched_by_them" ||
      chatDisabledBySafety;
    if (!roomId || !profile?.id || sending || cannotSend) return;
    const text = chatInput.trim();
    if (!text && composerUploads.length === 0) return;
    setSending(true);
    setUploadingComposer(composerUploads.length > 0);
    const prevText = chatInput;
    const prevUploads = [...composerUploads];
    try {
      const attachments = await uploadFilesToNotices(prevUploads, "chat-media");
      const payload = JSON.stringify({
        text,
        attachments,
      });
      const { error } = await supabase.from("chat_messages").insert({ chat_id: roomId, sender_id: profile.id, content: payload });
      if (error) throw error;
      setChatInput("");
      setComposerUploads([]);
      if (composerFileInputRef.current) {
        composerFileInputRef.current.value = "";
      }
      await loadRoomMessages(roomId);
    } catch {
      toast.error("Failed to send message");
      setChatInput(prevText);
      setComposerUploads(prevUploads);
    } finally {
      setSending(false);
      setUploadingComposer(false);
    }
  }, [blockState, chatDisabledBySafety, chatInput, composerUploads, loadRoomMessages, profile?.id, roomId, sending, unmatchState, uploadFilesToNotices]);

  const attachComposerMedia = useCallback(() => {
    const cannotAttach =
      blockState === "blocked_by_them" ||
      blockState === "blocked_by_me" ||
      unmatchState === "unmatched_by_them" ||
      sending;
    if (cannotAttach) return;
    composerFileInputRef.current?.click();
  }, [blockState, sending, unmatchState]);

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
      const { error } = await (supabase.rpc as (
        fn: string,
        params?: Record<string, unknown>
      ) => Promise<{ error: { message?: string } | null }>)("set_group_mute_state", {
        p_chat_id: roomId,
        p_muted: nextMuted,
      });
      if (error) throw error;
      if (profile?.id) {
        await supabase
          .from("chat_participants")
          .upsert({ chat_id: roomId, user_id: profile.id, role: "member", is_muted: nextMuted }, { onConflict: "chat_id,user_id" });
      }
      toast.success(nextMuted ? "Group muted" : "Notifications on");
    } catch {
      setGroupMuted(!nextMuted);
      toast.error("Unable to update notifications right now.");
    }
  }, [groupMuted, profile?.id, roomId]);

  const handleBlockToggle = useCallback(async () => {
    if (!counterpart?.id) return;
    try {
      if (blockState === "blocked_by_me") {
        const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
          "unblock_user",
          { p_blocked_id: counterpart.id }
        );
        if (error) throw error;
        setBlockState("none");
        toast.success("User unblocked");
      } else {
        const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
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
      const { error: rpcError } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
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
      // Fetch current members with profile data
      const { data: memberRows } = await supabase
        .from("chat_room_members")
        .select("user_id, profiles!chat_room_members_user_id_fkey(id, display_name, avatar_url, social_album)")
        .eq("chat_id", roomId);
      const members = (memberRows || []).map((row) => {
        const p = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { id?: string; display_name?: string; avatar_url?: string | null; social_album?: unknown } | null;
        const albumFallback = Array.isArray(p?.social_album)
          ? String((p!.social_album as unknown[])[0] || "").trim()
          : "";
        return { id: row.user_id as string, name: p?.display_name || "User", avatarUrl: p?.avatar_url || albumFallback || null };
      });
      setGroupManageMembers(members);

      // Fetch addable contacts: mutual matches + direct chat peers, excluding current members
      const memberIds = new Set(members.map((m) => m.id));
      const contactIdSet = new Set<string>();

      // 1. Mutual matches
      const { data: matchRows } = await supabase
        .from("matches")
        .select("user1_id, user2_id")
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .eq("is_active", true);
      (matchRows || []).forEach((r) => {
        const peerId = r.user1_id === profile.id ? r.user2_id : r.user1_id;
        if (!memberIds.has(peerId as string)) contactIdSet.add(peerId as string);
      });

      // 2. Direct (1-on-1) chat peers
      const { data: myRoomRows } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", profile.id);
      const myRoomIds = (myRoomRows || []).map((r) => r.chat_id as string);
      if (myRoomIds.length > 0) {
        const { data: directChats } = await supabase
          .from("chats")
          .select("id")
          .in("id", myRoomIds)
          .eq("type", "direct");
        const directIds = (directChats || []).map((c) => c.id as string);
        if (directIds.length > 0) {
          const { data: peerRows } = await supabase
            .from("chat_room_members")
            .select("user_id")
            .in("chat_id", directIds)
            .neq("user_id", profile.id);
          (peerRows || []).forEach((r) => {
            if (!memberIds.has(r.user_id as string)) contactIdSet.add(r.user_id as string);
          });
        }
      }

      if (contactIdSet.size === 0) {
        setGroupManageFriends([]);
        return;
      }
      const { data: friendProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, social_album")
        .in("id", [...contactIdSet]);
      setGroupManageFriends(
        (friendProfiles || []).map((p) => {
          const row = p as unknown as { id: string; display_name?: string | null; avatar_url?: string | null; social_album?: unknown };
          const albumFallback = Array.isArray(row.social_album)
            ? String((row.social_album as unknown[])[0] || "").trim()
            : "";
          return {
            id: row.id,
            name: row.display_name || "User",
            avatarUrl: row.avatar_url || albumFallback || null,
          };
        })
      );
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

  useEffect(() => {
    if (!groupManageOpen || !roomId) return;
    let reloadTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadGroupManageData();
      }, 120);
    };
    const channel = supabase
      .channel(`chat-dialogue-manage-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members", filter: `chat_id=eq.${roomId}` }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `chat_id=eq.${roomId}` }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests", filter: `chat_id=eq.${roomId}` }, () => {
        scheduleReload();
      })
      .subscribe();
    return () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [groupManageOpen, loadGroupManageData, roomId]);

  const openGroupInfoPanel = useCallback(() => {
    const media: string[] = [];
    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.content) as { attachments?: { url: string; mime: string }[] };
        if (Array.isArray(parsed.attachments)) {
          parsed.attachments.filter((item) => !item.mime.startsWith("video/")).forEach((item) => media.push(item.url));
        }
      } catch {
        // plain text rows
      }
    }
    setGroupMediaUrls(media);
    setGroupInfoOpen(true);
  }, [messages]);

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
          <button onClick={() => navigate(isGroup ? "/chats?tab=groups" : "/chats?tab=chats")} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
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
        {unmatchState === "unmatched_by_them" && (
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-[rgba(120,128,150,0.15)] px-3 py-1 text-xs font-medium text-[#8C93AA]">
              You've been unmatched.
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
                            <a key={`${message.id}-att-${idx}`} href={attachment.url} target="_blank" rel="noreferrer">
                              {attachment.mime.startsWith("video/") ? (
                                <video src={attachment.url} controls className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                              ) : (
                                <img src={attachment.url} alt={attachment.name} className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                      {parsed.text ? <div className="whitespace-pre-wrap break-words">{parsed.text}</div> : null}
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
      </div>

      <div className="border-t border-border bg-white/92 px-3 py-2 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+16px)]">
        {composerUploads.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {composerUploads.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                {file.type.startsWith("video/") ? (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">Video</div>
                ) : (
                  <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                )}
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
              unmatchState === "unmatched_by_them" ||
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
              unmatchState === "unmatched_by_them" ||
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
              unmatchState === "unmatched_by_them" ||
              (!chatInput.trim() && composerUploads.length === 0)
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brandBlue text-white disabled:opacity-45"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <PublicProfileSheet
        isOpen={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        loading={false}
        fallbackName={counterpart?.displayName || roomName}
        data={profileSheetData}
        viewedUserId={counterpart?.id || null}
        hideStartChatAction={true}
        zIndexBase={12000}
      />

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
        <SheetContent side="bottom" className="!bottom-0 rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{roomName}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+12px)]">
            <GroupDetailsPanel
              name={roomName}
              avatarUrl={groupAvatarUrl}
              memberCount={groupMemberCount}
              subtitle={groupLocationLabel ? `${groupMemberCount} members · ${groupLocationLabel}` : `${groupMemberCount} members`}
              description={groupDescription}
              mediaUrls={groupMediaUrls}
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
        <SheetContent side="bottom" className="!bottom-0 rounded-t-2xl max-h-[88vh] flex flex-col overflow-hidden">
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
          <div className="flex-1 overflow-y-auto space-y-5 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+12px)]">
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
                              if (!(profile as unknown as { is_verified?: boolean })?.is_verified) {
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
                                if (!(profile as unknown as { is_verified?: boolean })?.is_verified) {
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
                  // Insert system message BEFORE removing membership (policy checks membership)
                  // Table is chat_messages (FK target of message_reads); no message_type column
                  await supabase.from("chat_messages").insert({
                    chat_id: roomId,
                    sender_id: profile.id,
                    content: `${displayName} left the group.`,
                  });
                  // Then remove the user from the group
                  await supabase
                    .from("chat_room_members")
                    .delete()
                    .eq("chat_id", roomId)
                    .eq("user_id", profile.id);
                  await supabase
                    .from("chat_participants")
                    .delete()
                    .eq("chat_id", roomId)
                    .eq("user_id", profile.id);
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
                  const { error } = await (supabase.rpc as (
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
