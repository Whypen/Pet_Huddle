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
  const [inlineError, setInlineError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = () => {
    setCode("");
    setInlineError("");
    onClose();
  };

  const handleJoin = async (rawCode: string) => {
    const trimmed = rawCode.replace(/\s+/g, "").trim().toUpperCase();
    if (trimmed.length !== 6) {
      setInlineError("This code is invalid. Please try again.");
      return;
    }
    if (!user?.id) {
      toast.error("Sign in to join a group.");
      return;
    }

    setInlineError("");
    setIsJoining(true);
    try {
      const { data, error } = await (supabase.rpc as (
        fn: string,
        params?: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)("join_private_group_by_code", {
        p_code: trimmed,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? (data[0] as { chat_id?: string | null; chat_name?: string | null; joined?: boolean; reason?: string | null } | undefined) : undefined;
      if (!row?.joined || !row.chat_id) {
        setInlineError("This code is invalid. Please try again.");
        return;
      }

      resetAndClose();
      navigate(`/chat-dialogue?room=${encodeURIComponent(row.chat_id)}&name=${encodeURIComponent(row.chat_name || "Group")}`);
    } catch (err) {
      console.error("Join with code error:", err);
      setInlineError("This code is invalid. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 6);
    setCode(raw);
    if (inlineError) setInlineError("");
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
        {inlineError ? (
          <p className="mt-[-8px] text-center text-[12px] font-medium text-[var(--color-error,#E84545)]">
            {inlineError}
          </p>
        ) : null}

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
