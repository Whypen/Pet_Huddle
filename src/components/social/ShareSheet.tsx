import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, X } from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";
import { buildSocialShareLinks } from "@/lib/socialShare";
import { toast } from "sonner";
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type ChatShareTarget = {
  chatId: string;
  label: string;
  avatarUrl: string | null;
  lastMessageAt: string | null;
};

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  onShareAction?: () => void;
}

export const ShareSheet = ({ open, onClose, url, imageUrl, onShareAction }: ShareSheetProps) => {
  const links = buildSocialShareLinks(url);
  const payloadText = url.trim();
  const { profile } = useAuth();

  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [chatTargets, setChatTargets] = useState<ChatShareTarget[]>([]);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  const sortedChatTargets = useMemo(
    () => [...chatTargets].sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")),
    [chatTargets]
  );

  const handleSystemShare = async () => {
    if (!navigator.share) return false;
    try {
      const basePayload: ShareData = {
        url: payloadText,
      };

      if (imageUrl && typeof navigator.canShare === "function" && typeof File !== "undefined") {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            const ext = blob.type.split("/")[1] || "jpg";
            const file = new File([blob], `huddle-share.${ext}`, { type: blob.type || "image/jpeg" });
            const filePayload: ShareData = { ...basePayload, files: [file] };
            if (navigator.canShare(filePayload)) {
              await navigator.share(filePayload);
              toast.success("Shared");
              return true;
            }
          }
        } catch {
          // Fall back to URL-only sharing if file fetch fails.
        }
      }

      await navigator.share(basePayload);
      toast.success("Shared");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info("Share canceled");
        return true;
      }
      toast.error("Unable to share right now");
      return true;
    }
  };

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(payloadText);
      toast.success("Link copied");
      return true;
    } catch {
      toast.error("Failed to copy link");
      return false;
    }
  }, [payloadText]);

  const loadChatTargets = useCallback(async () => {
    if (!profile?.id) {
      toast.error("Sign in required");
      return;
    }

    setChatLoading(true);
    try {
      const { data: memberships, error: membershipError } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", profile.id);
      if (membershipError) throw membershipError;

      const chatIds = Array.from(
        new Set((memberships || []).map((row: { chat_id: string }) => row.chat_id).filter(Boolean))
      );

      if (!chatIds.length) {
        setChatTargets([]);
        setChatPickerOpen(true);
        return;
      }

      const { data: chatRows, error: chatRowsError } = await supabase
        .from("chats")
        .select("id,name,last_message_at")
        .in("id", chatIds);
      if (chatRowsError) throw chatRowsError;

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("chat_room_members")
        .select("chat_id,user_id,profiles!chat_room_members_user_id_fkey(display_name,avatar_url)")
        .in("chat_id", chatIds)
        .neq("user_id", profile.id);
      if (memberRowsError) throw memberRowsError;

      const memberByChatId = new Map<string, { label: string; avatarUrl: string | null }>();
      (memberRows || []).forEach((row: { chat_id: string; profiles?: { display_name?: string | null; avatar_url?: string | null } | null }) => {
        if (!row.chat_id || memberByChatId.has(row.chat_id)) return;
        const peer = row.profiles || null;
        const label = String(peer?.display_name || "Conversation").trim() || "Conversation";
        const avatarUrl = peer?.avatar_url || null;
        memberByChatId.set(row.chat_id, { label, avatarUrl });
      });

      const targets: ChatShareTarget[] = (chatRows || []).map((chat: { id: string; name?: string | null; last_message_at?: string | null }) => {
        const peer = memberByChatId.get(chat.id);
        return {
          chatId: chat.id,
          label: peer?.label || String(chat.name || "Conversation"),
          avatarUrl: peer?.avatarUrl || null,
          lastMessageAt: chat.last_message_at || null,
        };
      });

      setChatTargets(targets);
      setSelectedChatIds(new Set());
      setChatPickerOpen(true);
    } catch {
      toast.error("Unable to load chats right now");
    } finally {
      setChatLoading(false);
    }
  }, [profile?.id]);

  const sendToSelectedChats = useCallback(async () => {
    if (!profile?.id) {
      toast.error("Sign in required");
      return;
    }
    const chatIds = Array.from(selectedChatIds);
    if (!chatIds.length) {
      toast.info("Select at least one chat");
      return;
    }

    setChatSending(true);
    try {
      const payload = chatIds.map((chatId) => ({
        chat_id: chatId,
        sender_id: profile.id,
        content: payloadText,
      }));

      const { error } = await supabase.from("chat_messages").insert(payload as Record<string, unknown>[]);
      if (error) throw error;

      onShareAction?.();
      toast.success(`Shared to ${chatIds.length} chat${chatIds.length > 1 ? "s" : ""}`);
      setChatPickerOpen(false);
      onClose();
    } catch {
      toast.error("Unable to share to chats");
    } finally {
      setChatSending(false);
    }
  }, [onClose, onShareAction, payloadText, profile?.id, selectedChatIds]);

  const toggleChatSelection = useCallback((chatId: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }, []);

  const handleInstagramFallback = useCallback(async () => {
    onShareAction?.();
    await copyLink();
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    toast.info("Instagram web does not support direct Story creation. Link copied.");
    onClose();
  }, [copyLink, onClose, onShareAction]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[7000] bg-black/50 flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-4 max-w-[420px] w-full shadow-elevated"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-brandText">Share</h3>
              <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" type="button">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!chatPickerOpen ? (
              <div className="grid grid-cols-3 gap-2">
                <a
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  href={links.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    onShareAction?.();
                    onClose();
                  }}
                >
                  WhatsApp
                </a>
                <a
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  href={links.facebook}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    onShareAction?.();
                    onClose();
                  }}
                >
                  Facebook
                </a>
                <a
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  href={links.threads}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    onShareAction?.();
                    onClose();
                  }}
                >
                  Threads
                </a>
                <button
                  type="button"
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  onClick={() => {
                    void handleInstagramFallback();
                  }}
                >
                  Instagram
                </button>
                <button
                  type="button"
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  disabled={chatLoading}
                  onClick={() => {
                    void loadChatTargets();
                  }}
                >
                  {chatLoading ? "Loading..." : "Huddle Chats"}
                </button>
                <button
                  type="button"
                  className="neu-rest rounded-xl p-3 text-center text-xs"
                  onClick={() => {
                    onShareAction?.();
                    void copyLink();
                    onClose();
                  }}
                >
                  Copy Link
                </button>
                <button
                  type="button"
                  className="neu-rest rounded-xl p-3 text-center text-xs col-span-3"
                  onClick={async () => {
                    onShareAction?.();
                    const usedSystem = await handleSystemShare();
                    if (!usedSystem) {
                      await copyLink();
                    }
                    onClose();
                  }}
                >
                  Native Share
                </button>
              </div>
            ) : (
              <div>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {sortedChatTargets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chats available yet.</p>
                  ) : (
                    sortedChatTargets.map((target) => {
                      const selected = selectedChatIds.has(target.chatId);
                      return (
                        <button
                          key={target.chatId}
                          type="button"
                          className="w-full flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-left"
                          onClick={() => toggleChatSelection(target.chatId)}
                        >
                          <span className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-semibold">
                            {target.avatarUrl ? (
                              <img src={target.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (target.label || "C").charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className="flex-1 truncate text-sm font-medium text-brandText">{target.label}</span>
                          <span className={`h-5 w-5 rounded-full border flex items-center justify-center ${selected ? "bg-brandBlue border-brandBlue text-white" : "border-border"}`}>
                            {selected ? <Check className="w-3 h-3" /> : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <NeuButton variant="secondary" className="flex-1" onClick={() => setChatPickerOpen(false)}>
                    Back
                  </NeuButton>
                  <NeuButton className="flex-1" onClick={() => void sendToSelectedChats()} disabled={chatSending}>
                    {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
                  </NeuButton>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
