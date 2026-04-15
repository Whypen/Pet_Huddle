/**
 * JoinWithCodeSheet — join a private group via 6-digit room code.
 * Auto-submits on the 6th digit. Code = trust; no approval step needed.
 */

import { useRef, useState } from "react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuButton } from "@/components/ui/NeuButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JoinWithCodeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill the code field (e.g. from /join/:code invite link) */
  initialCode?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function JoinWithCodeSheet({ isOpen, onClose, initialCode }: JoinWithCodeSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [code, setCode]         = useState(initialCode ?? "");
  const [isJoining, setIsJoining] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = () => {
    setCode("");
    onClose();
  };

  const handleJoin = async (rawCode: string) => {
    const trimmed = rawCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      toast.error("Enter the full 6-digit code.");
      return;
    }
    if (!user?.id) {
      toast.error("Sign in to join a group.");
      return;
    }

    setIsJoining(true);
    try {
      // 1. Look up the group by room_code
      const { data: chat, error: findError } = await supabase
        .from("chats")
        .select("id, name, visibility")
        .eq("room_code", trimmed)
        .eq("visibility", "private")
        .maybeSingle();

      if (findError) throw findError;
      if (!chat) {
        toast.error("Code not found. Check and try again.");
        setIsJoining(false);
        return;
      }

      // 2. Check if already a member
      const { data: existing } = await supabase
        .from("chat_participants")
        .select("id")
        .eq("chat_id", chat.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Already in — just navigate
        toast.success(`Back to ${chat.name}!`);
        resetAndClose();
        navigate(`/chat-dialogue?room=${encodeURIComponent(chat.id)}`);
        return;
      }

      // 3. Join — code is trust, no approval required
      const { error: joinError } = await supabase
        .from("chat_participants")
        .insert({ chat_id: chat.id, user_id: user.id, role: "member" });
      if (joinError) throw joinError;

      // Add to chat_room_members so the group appears in My Groups
      await supabase
        .from("chat_room_members")
        .insert({ chat_id: chat.id, user_id: user.id });

      toast.success(`Joined ${chat.name}!`);
      resetAndClose();
      navigate(`/chat-dialogue?room=${encodeURIComponent(chat.id)}`);
    } catch (err) {
      console.error("Join with code error:", err);
      toast.error("Couldn't join. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 6);
    setCode(raw);
    if (raw.length === 6) {
      void handleJoin(raw);
    }
  };

  return (
    <GlassSheet
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Join with code"
    >
      <div className="flex flex-col items-center gap-6 pt-4 pb-2">

        {/* Hint */}
        <p className="text-[13px] text-[var(--text-tertiary)] text-center max-w-[26ch] leading-snug">
          Ask the group admin for their 6-digit invite code.
        </p>

        {/* Big code input */}
        <div className="relative w-full max-w-[220px]">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={handleChange}
            disabled={isJoining}
            placeholder="000000"
            className={[
              "w-full text-center tracking-[0.25em] font-bold rounded-2xl",
              "text-[28px] h-[64px] bg-white/30 border border-white/50",
              "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]/40",
              "focus:outline-none focus:ring-2 focus:ring-[var(--blue,#3B82F6)]/40",
              "transition-all duration-150",
              isJoining ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          />
        </div>

        {/* Digit progress dots */}
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="block w-2 h-2 rounded-full transition-colors duration-150"
              style={{
                backgroundColor: i < code.length
                  ? "var(--blue, #3B82F6)"
                  : "var(--text-tertiary, #9CA3AF)",
                opacity: i < code.length ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* Manual submit — for paste or accessibility */}
        <div className="w-full pt-1 border-t border-white/20">
          <NeuButton
            onClick={() => void handleJoin(code)}
            disabled={code.length < 6 || isJoining}
            loading={isJoining}
            className="w-full"
            size="lg"
          >
            {isJoining ? "Joining…" : "Join group"}
          </NeuButton>
        </div>

      </div>
    </GlassSheet>
  );
}
