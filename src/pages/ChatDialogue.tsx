import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Image as ImageIcon, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { PremiumFooter } from "@/components/monetization/PremiumFooter";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Message {
  id: string;
  content: string;
  senderId: string;
  timestamp: string;
}

const ChatDialogue = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatId = searchParams.get("id");
  const chatName = searchParams.get("name") || t("Chat");
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isPremiumFooterOpen, setIsPremiumFooterOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for incoming messages in this chat room
  useEffect(() => {
    if (!chatId) return;

    // Ensure current user is a member of the room (required for RLS)
    if (user?.id) {
      const ensureMembership = async () => {
        const { error } = await supabase
          .from("chat_room_members")
          .upsert({ room_id: chatId, user_id: user.id });

        if (error) {
          console.warn("Failed to join chat room:", error);
        }
      };

      ensureMembership();
    }

    const channel = supabase
      .channel(`chat_room_${chatId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `room_id=eq.${chatId}`,
      }, (payload: any) => {
        if (payload.new && payload.new.sender_id !== user?.id) {
          const incoming: Message = {
            id: payload.new.id,
            content: payload.new.content,
            senderId: payload.new.sender_id,
            timestamp: new Date(payload.new.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages(prev => [...prev, incoming]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, user?.id]);

  // Load existing messages on mount
  useEffect(() => {
    if (!chatId) return;

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, content, sender_id, created_at")
          .eq("room_id", chatId)
          .order("created_at", { ascending: true })
          .limit(100);

        if (!error && data) {
          const mapped: Message[] = data.map((m: any) => ({
            id: m.id,
            content: m.content,
            senderId: m.sender_id,
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }));
          setMessages(mapped);
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };
    loadMessages();
  }, [chatId]);

  const handleSend = async () => {
    if (!input.trim() || !chatId) return;

    const optimisticMessage: Message = {
      id: Date.now().toString(),
      content: input,
      senderId: user?.id || "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // Optimistic UI update
    setMessages(prev => [...prev, optimisticMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Persist to Supabase — realtime will broadcast to other clients
      const { error } = await supabase
        .from("chat_messages")
        .insert({
          room_id: chatId,
          sender_id: user?.id,
          content: optimisticMessage.content,
        });

      if (error) {
        // Rollback optimistic update on failure
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        toast.error(t("Failed to send message"));
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      toast.error(t("Network error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId || !user?.id) return;

    setIsLoading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/chat/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("notices").upload(path, file);
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("notices").getPublicUrl(path);
      const mediaUrl = pub.publicUrl;

      const optimisticMessage: Message = {
        id: `media-${Date.now()}`,
        content: mediaUrl,
        senderId: user.id,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      const { error } = await supabase.from("chat_messages").insert({
        room_id: chatId,
        sender_id: user.id,
        content: mediaUrl,
      });
      if (error) throw error;
    } catch (err) {
      console.error("Media send failed:", err);
      toast.error(t("Failed to send message"));
    } finally {
      e.target.value = "";
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Chat Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/chats")}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <UserAvatar name={chatName} size="sm" />
        <div className="flex-1">
          <h2 className="font-semibold">{chatName}</h2>
          <p className="text-xs text-muted-foreground">{t("Online")}</p>
        </div>
      </div>

      {/* SPRINT 3: Chat Messages - AI Vet UI Pattern */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-muted-foreground text-sm">{t("No messages yet")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("Start the conversation!")}</p>
          </div>
        )}

        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className={cn("flex", message.senderId === user?.id ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3",
                message.senderId === user?.id
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-accent-soft text-foreground rounded-bl-sm"
              )}
            >
              {/^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(message.content) ? (
                <img src={message.content} alt={t("Chat media")} className="max-w-full rounded-lg mb-1" />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              )}
              <span
                className={cn(
                  "text-xs mt-1 block",
                  message.senderId === user?.id ? "text-primary-foreground/70" : "text-muted-foreground"
                )}
              >
                {message.timestamp}
              </span>
            </div>
          </motion.div>
        ))}

        {/* Loading indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="bg-accent-soft rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("Typing...")}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - AI Vet Pattern */}
      <div className="fixed bottom-nav left-0 right-0 bg-card border-t border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <button
            onClick={() => {
              const isFree = !profile?.tier || profile?.tier === "free";
              const mediaCredits = profile?.media_credits || 0;
              if (isFree && mediaCredits <= 0) {
                setIsPremiumFooterOpen(true);
                return;
              }
              mediaInputRef.current?.click();
            }}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <ImageIcon className="w-5 h-5 text-primary" />
          </button>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleMediaSelected}
          />

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={t("Type a message...")}
            className="flex-1 bg-muted rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              "p-2 rounded-full transition-all",
              input.trim() && !isLoading
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <PremiumFooter
        isOpen={isPremiumFooterOpen}
        onClose={() => setIsPremiumFooterOpen(false)}
        triggerReason="chat_media"
      />
    </div>
  );
};

export default ChatDialogue;
