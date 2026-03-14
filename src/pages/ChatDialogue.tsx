import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, MoreVertical, SendHorizontal, ShieldAlert, UserX } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureDirectChatRoom } from "@/lib/chatRooms";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";

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
};

type CounterpartProfile = {
  id: string;
  displayName: string;
  socialId: string | null;
  avatarUrl: string | null;
  availability: string | null;
  isVerified: boolean;
  hasCar: boolean;
};

type BlockState = "none" | "blocked_by_them" | "blocked_by_me";
type UnmatchState = "none" | "unmatched_by_them";

const REPORT_REASONS = [
  "Spam or fake account",
  "Harassment or bullying",
  "Inappropriate or offensive content",
  "Unsafe or harmful behavior (online or in-person)",
  "Hate, discrimination, or threats",
  "Scams, money requests, or promotions",
  "Impersonation or stolen photos",
  "Other",
] as const;

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
  const [reportReasons, setReportReasons] = useState<Set<string>>(new Set());
  const [reportOther, setReportOther] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportUploads, setReportUploads] = useState<File[]>([]);
  const [composerUploads, setComposerUploads] = useState<File[]>([]);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [uploadingComposer, setUploadingComposer] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const reportImageInputRef = useRef<HTMLInputElement | null>(null);

  const reportUploadPreviews = useMemo(
    () =>
      reportUploads.map((file, idx) => ({
        key: `${file.name}-${file.size}-${idx}`,
        url: URL.createObjectURL(file),
      })),
    [reportUploads]
  );

  useEffect(() => {
    return () => {
      reportUploadPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [reportUploadPreviews]);

  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const canSendVideo = tier === "gold";
  const directPeerByRoomKey = useMemo(
    () => `chat_direct_peer_by_room_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const firstHelloStarters = useMemo(
    () => [
      "Hey there—what drew your pack to Huddle?",
      "Hello! Loving your pics—any fun walks lately?",
      "Hey how're you doing?",
    ],
    []
  );

  const parseMessageContent = useCallback((content: string): ParsedMessage => {
    try {
      const parsed = JSON.parse(content) as { text?: string; attachments?: Attachment[] };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.attachments)) {
        return {
          text: String(parsed.text || ""),
          attachments: parsed.attachments
            .filter((item) => item && typeof item.url === "string" && item.url)
            .map((item) => ({
              url: String(item.url),
              mime: String(item.mime || ""),
              name: String(item.name || "media"),
            })),
        };
      }
    } catch {
      // plain text fallback
    }
    return { text: content, attachments: [] };
  }, []);

  const markMessagesAsRead = useCallback(async (roomMessages: ChatMessage[]) => {
    if (!profile?.id || roomMessages.length === 0) return;

    const incomingIds = roomMessages
      .filter((message) => message.sender_id && message.sender_id !== profile.id)
      .map((message) => message.id)
      .filter(Boolean);

    if (incomingIds.length === 0) return;

    const { data: existingReads } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", profile.id)
      .in("message_id", incomingIds);

    const existingSet = new Set(
      (existingReads || []).map((row: { message_id?: string | null }) => String(row?.message_id || "")).filter(Boolean),
    );

    const missingRows = incomingIds
      .filter((messageId) => !existingSet.has(messageId))
      .map((messageId) => ({
        message_id: messageId,
        user_id: profile.id,
        read_at: new Date().toISOString(),
      }));

    if (missingRows.length === 0) return;

    const { error: upsertError } = await supabase
      .from("message_reads")
      .upsert(missingRows, { onConflict: "message_id,user_id" });

    if (upsertError) {
      console.warn("[ChatDialogue] mark read failed", upsertError.message);
    }
  }, [profile?.id]);

  const loadRoomMessages = useCallback(async (nextRoomId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("chat_id", nextRoomId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const nextMessages = (data || []) as ChatMessage[];
    setMessages(nextMessages);
    void markMessagesAsRead(nextMessages);
  }, [markMessagesAsRead]);

  const loadCounterpart = useCallback(async (nextRoomId: string, fallbackName: string, hintUserId?: string | null) => {
    if (!profile?.id) return;
    const { data: members, error: membersError } = await supabase
      .from("chat_room_members")
      .select("user_id")
      .eq("chat_id", nextRoomId);
    if (membersError) throw membersError;

    const memberCounterpartId = (members || [])
      .map((row: { user_id: string }) => row.user_id)
      .find((id: string) => id !== profile.id);
    let counterpartId = memberCounterpartId || null;
    if (!counterpartId && hintUserId && hintUserId !== profile.id) {
      counterpartId = hintUserId;
    }
    if (!counterpartId) {
      try {
        const raw = localStorage.getItem(directPeerByRoomKey);
        const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        const cached = String(parsed?.[nextRoomId] || "").trim();
        if (cached && cached !== profile.id) counterpartId = cached;
      } catch {
        // ignore malformed cache
      }
    }
    if (!counterpartId) return;

    let profileRow: Record<string, unknown> | null = null;
    let privateRow: Record<string, unknown> | null = null;
    const privateSelectPrimary = "id, display_name, social_id, avatar_url, availability_status, verification_status, is_verified, has_car";
    const privateSelectFallback = "id, display_name, social_id, avatar_url, availability_status, verification_status, is_verified, has_car";
    const { data: privateData, error: privateErr } = await supabase
      .from("profiles")
      .select(privateSelectPrimary)
      .eq("id", counterpartId)
      .maybeSingle();
    if (privateErr) {
      const { data: fallbackData } = await supabase
        .from("profiles")
        .select(privateSelectFallback)
        .eq("id", counterpartId)
        .maybeSingle();
      privateRow = (fallbackData as Record<string, unknown> | null) ?? null;
    } else {
      privateRow = (privateData as Record<string, unknown> | null) ?? null;
    }
    profileRow = privateRow;
    if (!profileRow) {
      const { data: publicRow } = await supabase
        .from("profiles_public")
        .select("id, display_name, avatar_url, availability_status, user_role, has_car")
        .eq("id", counterpartId)
        .maybeSingle();
      profileRow = (publicRow as Record<string, unknown> | null) ?? null;
    }

    const displayName = String(profileRow?.display_name || fallbackName || "Conversation");
    const socialId = typeof profileRow?.social_id === "string" && profileRow.social_id ? String(profileRow.social_id) : null;
    const availabilityList = Array.isArray(profileRow?.availability_status)
      ? profileRow.availability_status.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
    const availability =
      availabilityList.length > 0
        ? availabilityList.map((entry) => normalizeAvailabilityLabel(entry)).filter(Boolean).join(" • ")
        : normalizeAvailabilityLabel(String(profileRow?.social_role || profileRow?.user_role || ""));

    setRoomName(displayName);
    setCounterpart({
      id: counterpartId,
      displayName,
      socialId,
      avatarUrl: (profileRow?.avatar_url as string | null) || null,
      availability: availability || null,
      isVerified: profileRow?.is_verified === true,
      hasCar: Boolean(profileRow?.has_car),
    });

    try {
      const raw = localStorage.getItem(directPeerByRoomKey);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      localStorage.setItem(
        directPeerByRoomKey,
        JSON.stringify({
          ...parsed,
          [nextRoomId]: counterpartId,
        })
      );
    } catch {
      // ignore cache write failure
    }

    const { data: blocks } = await supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`and(blocker_id.eq.${profile.id},blocked_id.eq.${counterpartId}),and(blocker_id.eq.${counterpartId},blocked_id.eq.${profile.id})`)
      .limit(1);
    const relation = Array.isArray(blocks) && blocks.length > 0 ? blocks[0] : null;
    if (relation?.blocker_id === counterpartId && relation?.blocked_id === profile.id) {
      setBlockState("blocked_by_them");
    } else if (relation?.blocker_id === profile.id && relation?.blocked_id === counterpartId) {
      setBlockState("blocked_by_me");
    } else {
      setBlockState("none");
    }

    const { data: unmatches } = await supabase
      .from("user_unmatches")
      .select("actor_id, target_id")
      .or(`and(actor_id.eq.${counterpartId},target_id.eq.${profile.id}),and(actor_id.eq.${profile.id},target_id.eq.${counterpartId})`)
      .limit(1);
    const unmatchRelation = Array.isArray(unmatches) && unmatches.length > 0 ? unmatches[0] : null;
    if (unmatchRelation?.actor_id === counterpartId && unmatchRelation?.target_id === profile.id) {
      setUnmatchState("unmatched_by_them");
    } else {
      setUnmatchState("none");
    }
  }, [directPeerByRoomKey, profile?.id]);

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

  useEffect(() => {
    if (!profile?.id) {
      navigate("/auth", { replace: true });
      return;
    }

    const room = searchParams.get("room");
    const name = searchParams.get("name") || "Conversation";
    const hintedUserId = searchParams.get("with");
    if (room) {
      void (async () => {
        try {
          const { data: membership } = await supabase
            .from("chat_room_members")
            .select("chat_id")
            .eq("chat_id", room)
            .eq("user_id", profile.id)
            .maybeSingle();

          if (membership) {
            setRoomId(room);
            await Promise.all([loadRoomMessages(room), loadCounterpart(room, name, hintedUserId)]);
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
          await Promise.all([loadRoomMessages(nextRoomId), loadCounterpart(nextRoomId, name, fallbackTargetId)]);
          navigate(
            `/chat-dialogue?room=${encodeURIComponent(nextRoomId)}&name=${encodeURIComponent(name)}&with=${encodeURIComponent(fallbackTargetId)}`,
            { replace: true }
          );
        } catch {
          toast.error("Unable to load messages right now.");
          navigate("/chats?tab=chats", { replace: true });
        } finally {
          setLoading(false);
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
        await Promise.all([loadRoomMessages(directRoomId), loadCounterpart(directRoomId, targetName, targetUserId)]);
      } catch {
        toast.error("Unable to open conversation right now.");
        navigate("/chats?tab=chats", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCounterpart, loadRoomMessages, navigate, profile?.id, searchParams]);

  useEffect(() => {
    if (!roomId) return;
    const roomChannel = supabase
      .channel(`chat_dialogue_room_${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` }, () => {
        void loadRoomMessages(roomId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [loadRoomMessages, roomId]);

  const sendMessage = useCallback(async () => {
    const cannotSend =
      blockState === "blocked_by_them" ||
      blockState === "blocked_by_me" ||
      unmatchState === "unmatched_by_them";
    if (!roomId || !profile?.id || sending || cannotSend) return;
    const text = chatInput.trim();
    if (!text && composerUploads.length === 0) return;
    setSending(true);
    setUploadingComposer(composerUploads.length > 0);
    const prevText = chatInput;
    const prevUploads = [...composerUploads];
    setChatInput("");
    setComposerUploads([]);
    try {
      const attachments = await uploadFilesToNotices(prevUploads, "chat-media");
      const payload = JSON.stringify({
        text,
        attachments,
      });
      const { error } = await supabase.from("chat_messages").insert({ chat_id: roomId, sender_id: profile.id, content: payload });
      if (error) throw error;
      await loadRoomMessages(roomId);
    } catch {
      toast.error("Failed to send message");
      setChatInput(prevText);
      setComposerUploads(prevUploads);
    } finally {
      setSending(false);
      setUploadingComposer(false);
    }
  }, [blockState, chatInput, composerUploads, loadRoomMessages, profile?.id, roomId, sending, unmatchState, uploadFilesToNotices]);

  const openCounterpartProfile = useCallback(async () => {
    if (!counterpart?.id) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", counterpart.id)
      .maybeSingle();
    setProfileSheetData((data as Record<string, unknown> | null) ?? null);
    setProfileSheetOpen(true);
  }, [counterpart?.id]);

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
  }, [counterpart?.id, navigate, profile?.id]);

  const handleReportSubmit = useCallback(async () => {
    if (!profile?.id || !counterpart?.id) return;
    const selectedReasons = Array.from(reportReasons);
    if (selectedReasons.length === 0) {
      toast.error("Select at least one reason.");
      return;
    }
    setReportSubmitting(true);
    try {
      const attachments = await uploadFilesToNotices(reportUploads, "reports");
      const payload = {
        target_user_id: counterpart.id,
        room_id: roomId,
        reasons: selectedReasons,
        other: selectedReasons.includes("Other") ? reportOther.trim() : "",
        details: reportDetails.trim(),
        attachments: attachments.map((item) => item.url),
      };
      const { error } = await supabase.from("support_requests").insert({
        user_id: profile.id,
        category: "user_report",
        subject: `Report user ${counterpart.id}`,
        message: JSON.stringify(payload),
        email: profile.email || null,
      });
      if (error) throw error;
      toast.success("Report sent");
      setReportOpen(false);
      setReportReasons(new Set());
      setReportOther("");
      setReportDetails("");
      setReportUploads([]);
    } catch {
      toast.error("Unable to submit report right now.");
    } finally {
      setReportSubmitting(false);
    }
  }, [counterpart?.id, profile?.email, profile?.id, reportDetails, reportOther, reportReasons, reportUploads, roomId, uploadFilesToNotices]);

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
          <button onClick={() => navigate("/chats?tab=chats")} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button onClick={() => void openCounterpartProfile()} className="shrink-0">
            <UserAvatar
              avatarUrl={counterpart?.avatarUrl || null}
              name={counterpart?.displayName || roomName}
              isVerified={counterpart?.isVerified || false}
              hasCar={counterpart?.hasCar || false}
              size="md"
              showBadges={true}
            />
          </button>
          <button onClick={() => void openCounterpartProfile()} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-brandText">
              {counterpart?.displayName || roomName}
              {counterpart?.socialId ? <span className="ml-1 text-xs font-medium text-muted-foreground">@{counterpart.socialId}</span> : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">{counterpart?.availability || "Friend"}</div>
          </button>
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
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 flex flex-col">
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
        {messages.length === 0 ? (
          <div className="mt-auto rounded-[18px] border border-white/45 bg-white/55 p-3 shadow-[0_10px_24px_rgba(33,71,201,0.10)] backdrop-blur-[18px]">
            <p className="text-sm font-semibold text-[#4F5677]">Paw-Vibe Check?</p>
            <div className="mt-2 flex flex-col gap-2">
              {firstHelloStarters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="w-full rounded-[12px] border border-white/55 bg-white/65 px-3 py-2 text-left text-xs text-[#4F5677] transition-colors hover:bg-white/80"
                  onClick={() => setChatInput(starter)}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const mine = message.sender_id === profile?.id;
            const parsed = parseMessageContent(message.content);
            const attachments = parsed.attachments;
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
                <div
                  className={cn(
                    "w-fit max-w-[90%] rounded-xl border px-3 py-2 text-sm",
                    mine
                      ? "ml-auto border-[rgba(255,255,255,0.36)] bg-brandBlue text-white"
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
                <div className={cn("mt-1 text-[11px] text-[#9AA0B5]", mine ? "text-right pr-1" : "text-left pl-1")}>
                  {formatMessageTime(message.created_at)}
                </div>
              </div>
            );
          })
        )}
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
          <div className="flex flex-1 items-center gap-2 rounded-[12px] bg-[rgba(255,255,255,0.72)] px-1.5 shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent disabled:opacity-45"
            onClick={() => imageInputRef.current?.click()}
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
            ref={imageInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const picked = Array.from(event.target.files || []);
              const allowed = picked.filter((file) => {
                if (!file.type?.startsWith("video/")) return true;
                return canSendVideo;
              });
              if (picked.some((file) => file.type?.startsWith("video/")) && !canSendVideo) {
                toast.info("Video upload is for Gold members only.");
              }
              if (allowed.length) setComposerUploads((prev) => [...prev, ...allowed].slice(0, 10));
              event.currentTarget.value = "";
            }}
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
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={
              sending ||
              uploadingComposer ||
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
            <DialogTitle>{blockState === "blocked_by_me" ? "Unblock user" : "Block user"}</DialogTitle>
            <DialogDescription>
              {blockState === "blocked_by_me"
                ? "Allow this user to send you messages again?"
                : "Are you sure you don't want to receive any message from this user?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="h-10 rounded-full border px-4 text-sm" onClick={() => setConfirmBlockOpen(false)}>Cancel</button>
            <button className="h-10 rounded-full bg-brandBlue px-4 text-sm text-white" onClick={() => void handleBlockToggle()}>
              {blockState === "blocked_by_me" ? "Unblock User" : "Block User"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report user</DialogTitle>
            <DialogDescription>Tell us what happened so we can protect the community.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              {REPORT_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reportReasons.has(reason)}
                    onChange={(event) => {
                      setReportReasons((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(reason);
                        else next.delete(reason);
                        return next;
                      });
                    }}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            {reportReasons.has("Other") && (
              <div className="form-field-rest relative flex items-center">
                <input
                  value={reportOther}
                  onChange={(event) => setReportOther(event.target.value)}
                  placeholder="Other reason"
                  className="field-input-core"
                />
              </div>
            )}
            <div className="form-field-rest relative h-auto min-h-[96px] py-3">
              <Textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                placeholder="Add details (optional)"
                className="field-input-core min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
            <div>
              <button
                type="button"
                className="neu-icon h-10 w-10"
                onClick={() => reportImageInputRef.current?.click()}
                aria-label="Upload image"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input
                ref={reportImageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  setReportUploads((prev) => [...prev, ...files].slice(0, 5));
                  event.currentTarget.value = "";
                }}
              />
              {reportUploads.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {reportUploadPreviews.map((preview, idx) => (
                    <div
                      key={preview.key}
                      className="h-[96px] w-[96px] overflow-hidden rounded-xl bg-muted/30"
                    >
                      <img
                        src={preview.url}
                        alt={`Upload ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => void handleReportSubmit()}
              disabled={reportSubmitting}
              className="h-11 w-full rounded-full bg-brandBlue text-sm font-semibold text-white disabled:opacity-45"
            >
              {reportSubmitting ? "Sending..." : "Send report"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatDialogue;
