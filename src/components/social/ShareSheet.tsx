import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NeuButton } from "@/components/ui/NeuButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ShareModel } from "@/lib/shareModel";
import { serializeChatShareMessage } from "@/lib/shareModel";

type ShareTarget = {
  chatId: string;
  userId: string | null;
  type: "direct" | "group" | "service";
  socialId: string | null;
  label: string;
  subtitle: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;
};

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  share: ShareModel;
  onShareAction?: () => void;
}

const getTargetKey = (target: ShareTarget) => target.chatId || `user:${target.userId || "unknown"}`;

const toEpoch = (value?: string | null) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

type MatchRow = {
  user1_id: string;
  user2_id: string;
};

export const ShareSheet = ({ open, onClose, share, onShareAction }: ShareSheetProps) => {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sendingChat, setSendingChat] = useState(false);

  const selectedTarget = useMemo(
    () => targets.find((target) => getTargetKey(target) === selectedKey) ?? null,
    [selectedKey, targets],
  );

  const filteredTargets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target) => {
      const haystack = `${target.label} ${target.subtitle || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, targets]);

  const loadTargets = useCallback(async () => {
    if (!profile?.id) {
      setTargets([]);
      return;
    }

    setLoadingTargets(true);
    try {
      const fetchUserMatches = async (): Promise<MatchRow[]> => {
        const attempts: Array<{ select: string; activeOnly: boolean }> = [
          { select: "user1_id,user2_id", activeOnly: true },
          { select: "user1_id,user2_id", activeOnly: false },
        ];
        for (const attempt of attempts) {
          let query = supabase
            .from("matches")
            .select(attempt.select)
            .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
            .limit(500);
          if (attempt.activeOnly) query = query.eq("is_active", true);
          const result = await query;
          if (result.error) continue;
          if (attempt.activeOnly && Array.isArray(result.data) && result.data.length === 0) continue;
          return ((result.data || []) as Array<Record<string, unknown>>).map((row) => ({
            user1_id: String(row.user1_id || ""),
            user2_id: String(row.user2_id || ""),
          }));
        }
        return [];
      };

      const matchedRows = await fetchUserMatches();
      const matchedPeerIds = new Set(
        matchedRows
          .map((row) => (row.user1_id === profile.id ? row.user2_id : row.user1_id))
          .filter((id) => Boolean(id) && id !== profile.id),
      );

      const { data: memberships, error: membershipError } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", profile.id);
      if (membershipError) throw membershipError;

      const chatIds = Array.from(
        new Set((memberships || []).map((row: { chat_id: string }) => String(row.chat_id || "").trim()).filter(Boolean)),
      );
      if (!chatIds.length) {
        setTargets([]);
        return;
      }

      const { data: chatRows, error: chatError } = await supabase
        .from("chats")
        .select("id,name,avatar_url,last_message_at,type")
        .in("id", chatIds);
      if (chatError) throw chatError;

      const { data: serviceRows } = await supabase
        .from("service_chats")
        .select("chat_id")
        .in("chat_id", chatIds);
      const serviceChatIds = new Set(
        ((serviceRows || []) as Array<{ chat_id?: string | null }>)
          .map((row) => String(row.chat_id || "").trim())
          .filter(Boolean),
      );

      const { data: messageRows, error: messageError } = await supabase
        .from("chat_messages")
        .select("chat_id,content,created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false });
      if (messageError) throw messageError;

      const latestMessageByChat = new Map<string, { content: string; created_at: string | null }>();
      (messageRows || []).forEach((row: { chat_id: string; content?: string | null; created_at?: string | null }) => {
        if (!row.chat_id || latestMessageByChat.has(row.chat_id)) return;
        latestMessageByChat.set(row.chat_id, {
          content: String(row.content || "").trim(),
          created_at: row.created_at || null,
        });
      });

      const { data: memberRows, error: memberError } = await supabase
        .from("chat_room_members")
        .select("chat_id,user_id,profiles!chat_room_members_user_id_fkey(id,display_name,social_id,avatar_url)")
        .in("chat_id", chatIds);
      if (memberError) throw memberError;

      const membersByChat = new Map<string, Array<{ user_id: string; profiles?: { id?: string; display_name?: string | null; social_id?: string | null; avatar_url?: string | null } | null }>>();
      (memberRows || []).forEach((row: { chat_id: string; user_id: string; profiles?: { id?: string; display_name?: string | null; social_id?: string | null; avatar_url?: string | null } | null }) => {
        if (!row.chat_id) return;
        const next = membersByChat.get(row.chat_id) || [];
        next.push(row);
        membersByChat.set(row.chat_id, next);
      });

      const peerIds = Array.from(
        new Set(
          ((memberRows || []) as Array<{ user_id?: string | null }>)
            .map((row) => String(row.user_id || "").trim())
            .filter((id) => Boolean(id) && id !== profile.id),
        ),
      );
      const blockedByMe = new Set<string>();
      const blockedByThem = new Set<string>();
      const unmatchedByThem = new Set<string>();
      if (peerIds.length > 0) {
        const [{ data: blocksFromMe }, { data: blocksToMe }, { data: unmatchesToMe }] = await Promise.all([
          supabase
            .from("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", profile.id)
            .in("blocked_id", peerIds),
          supabase
            .from("user_blocks")
            .select("blocker_id")
            .eq("blocked_id", profile.id)
            .in("blocker_id", peerIds),
          supabase
            .from("user_unmatches")
            .select("actor_id")
            .eq("target_id", profile.id)
            .in("actor_id", peerIds),
        ]);
        for (const row of (blocksFromMe || []) as Array<{ blocked_id?: string | null }>) {
          const id = String(row.blocked_id || "").trim();
          if (id) blockedByMe.add(id);
        }
        for (const row of (blocksToMe || []) as Array<{ blocker_id?: string | null }>) {
          const id = String(row.blocker_id || "").trim();
          if (id) blockedByThem.add(id);
        }
        for (const row of (unmatchesToMe || []) as Array<{ actor_id?: string | null }>) {
          const id = String(row.actor_id || "").trim();
          if (id) unmatchedByThem.add(id);
        }
      }

      const deduped = new Map<string, ShareTarget>();
      (chatRows || []).forEach((chat: { id: string; name?: string | null; avatar_url?: string | null; last_message_at?: string | null; type?: string | null }) => {
        const chatId = String(chat.id || "").trim();
        if (!chatId) return;
        const latestMessage = latestMessageByChat.get(chatId);
        const hasActivity = Boolean(chat.last_message_at) || Boolean(latestMessage?.content);
        if (!hasActivity) return;

        const rows = membersByChat.get(chatId) || [];
        const peers = rows.filter((row) => row.user_id !== profile.id);
        const uniquePeers = Array.from(
          new Map(peers.map((row) => [String(row.user_id || "").trim(), row])).values(),
        ).filter((row) => String(row.user_id || "").trim().length > 0);
        const isGroup = chat.type === "group";
        const isService = serviceChatIds.has(chatId) || chat.type === "service";
        const primaryPeer = uniquePeers[0] || null;
        const userId = primaryPeer?.user_id ? String(primaryPeer.user_id) : null;
        if (!isGroup && !isService) {
          if (!userId) return;
          if (!matchedPeerIds.has(userId)) return;
          if (blockedByMe.has(userId) || blockedByThem.has(userId) || unmatchedByThem.has(userId)) return;
        }
        const peerDisplayName = String(primaryPeer?.profiles?.display_name || "").trim();
        const chatName = String(chat.name || "").trim();
        const displayName = isGroup
          ? (chatName || "Group chat")
          : (peerDisplayName || chatName || "Conversation");
        const socialId = String(primaryPeer?.profiles?.social_id || "").trim().replace(/^@+/, "");
        if (!isGroup && !isService && displayName === "Conversation" && !socialId && !primaryPeer?.profiles?.avatar_url) return;
        const subtitle = isGroup ? "Group chat" : isService ? "Service" : (socialId ? `@${socialId}` : "Chat");
        const avatarUrl = isGroup
          ? (chat.avatar_url || null)
          : (primaryPeer?.profiles?.avatar_url || chat.avatar_url || null);
        const target: ShareTarget = {
          chatId,
          userId: isGroup ? null : userId,
          type: isGroup ? "group" : isService ? "service" : "direct",
          socialId: isGroup ? null : (socialId || null),
          label: displayName,
          subtitle,
          avatarUrl,
          lastMessageAt: chat.last_message_at || latestMessage?.created_at || null,
        };
        const dedupeKey = isGroup
          ? `chat:${chatId}`
          : socialId
            ? `social:${socialId.toLowerCase()}`
            : userId
              ? `user:${userId}`
              : `chat:${chatId}`;
        const existing = deduped.get(dedupeKey);
        if (!existing) {
          deduped.set(dedupeKey, target);
          return;
        }
        if (toEpoch(target.lastMessageAt) > toEpoch(existing.lastMessageAt)) {
          deduped.set(dedupeKey, target);
        }
      });

      const nextTargets = Array.from(deduped.values()).sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
      setTargets(nextTargets);
      setSelectedKey((prev) => (prev && nextTargets.some((target) => getTargetKey(target) === prev) ? prev : nextTargets[0] ? getTargetKey(nextTargets[0]) : null));
    } catch {
      toast.error("Unable to load chats right now");
      setTargets([]);
    } finally {
      setLoadingTargets(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    void loadTargets();
  }, [loadTargets, open]);

  const handleNativeShare = useCallback(async () => {
    onShareAction?.();
    const payload: ShareData = {
      title: share.title,
      text: share.nativeShareText,
      url: share.canonicalUrl,
    };

    if (!navigator.share) {
      try {
        await navigator.clipboard.writeText(share.canonicalUrl);
        toast.success("Link copied");
      } catch {
        toast.error("Native share is unavailable on this device");
      }
      onClose();
      return;
    }

    try {
      await navigator.share(payload);
      toast.success("Shared");
      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info("Share canceled");
        return;
      }
      toast.error("Unable to share right now");
    }
  }, [onClose, onShareAction, share.canonicalUrl, share.nativeShareText, share.title]);

  const handleShareToChat = useCallback(async () => {
    if (!profile?.id) {
      toast.error("Sign in required");
      return;
    }
    if (!selectedTarget) {
      toast.info("Select a chat first");
      return;
    }

    setSendingChat(true);
    try {
      const payload = serializeChatShareMessage(share);
      const { error } = await supabase.from("chat_messages").insert({
        chat_id: selectedTarget.chatId,
        sender_id: profile.id,
        content: payload,
      });
      if (error) throw error;
      onShareAction?.();
      toast.success(`Shared to ${selectedTarget.label}`);
      onClose();
    } catch {
      toast.error("Unable to share to Huddle Chats");
    } finally {
      setSendingChat(false);
    }
  }, [onClose, onShareAction, profile?.id, selectedTarget, share]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[7000] bg-black/50 backdrop-blur-[4px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(event) => event.stopPropagation()}
            className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[var(--app-max-width,430px)] rounded-t-[28px] border border-white/45 bg-[rgba(255,255,255,0.92)] px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3 shadow-[0_-18px_48px_rgba(36,55,120,0.18)] backdrop-blur-[18px]"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[rgba(163,168,190,0.5)]" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-[#424965]">Share</h3>
              <button type="button" onClick={onClose} className="rounded-full p-1 text-[#8C93AA] transition-colors hover:bg-white/70">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C93AA]" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search User name or Social ID"
                className="h-11 w-full rounded-full border border-[rgba(163,168,190,0.22)] bg-[rgba(244,247,251,0.95)] pl-10 pr-4 text-sm text-[#424965] outline-none shadow-[inset_2px_2px_5px_rgba(163,168,190,0.22),inset_-1px_-1px_4px_rgba(255,255,255,0.8)] placeholder:text-[#9AA0B5] focus:border-[rgba(33,69,207,0.28)]"
              />
            </div>

            <div className="mb-4 min-h-[110px]">
              {loadingTargets ? (
                <div className="flex h-[92px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#8C93AA]" />
                </div>
              ) : filteredTargets.length === 0 ? (
                <div className="flex h-[92px] items-center justify-center rounded-[18px] border border-dashed border-[rgba(163,168,190,0.28)] bg-[rgba(244,247,251,0.55)] px-4 text-center text-sm text-[#8C93AA]">
                  No chats found.
                </div>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-3 pr-1">
                    {filteredTargets.map((target) => {
                      const selected = getTargetKey(target) === selectedKey;
                      return (
                        <button
                          key={getTargetKey(target)}
                          type="button"
                          onClick={() => setSelectedKey(getTargetKey(target))}
                          className="w-[76px] shrink-0 text-center"
                        >
                          <div
                            className={cn(
                              "mx-auto flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-full border bg-white shadow-[0_8px_16px_rgba(36,55,120,0.10)] transition-all",
                              selected
                                ? "border-[#2145CF] ring-2 ring-[#2145CF]/15"
                                : "border-[rgba(163,168,190,0.25)]",
                            )}
                          >
                            {target.avatarUrl ? (
                              <img src={target.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-lg font-semibold text-[#424965]">{target.label.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-1 text-[12px] font-medium text-[#424965]">{target.label}</p>
                          <p className="line-clamp-1 text-[11px] text-[#8C93AA]">{target.subtitle || "Chat"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NeuButton
                variant="secondary"
                className="h-12 rounded-[18px]"
                onClick={() => void handleShareToChat()}
                disabled={!selectedTarget || sendingChat || loadingTargets}
              >
                {sendingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Huddle Chats
              </NeuButton>
              <NeuButton
                variant="secondary"
                className="h-12 rounded-[18px]"
                onClick={() => void handleNativeShare()}
              >
                <Send className="h-4 w-4" />
                Share…
              </NeuButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
