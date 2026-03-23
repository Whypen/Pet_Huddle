/**
 * ComposerDock — DESIGN_MASTER_SPEC §3.2 + §3.3 + §7 Template D
 *
 * Glass E2 composer input dock for Chat + AI Vet.
 * Fixed to bottom above BottomNav; safe-area aware.
 * Backdrop blur is ALLOWED here (§3.2: "Composer docks").
 *
 * Usage:
 *   <ComposerDock
 *     value={input}
 *     onChange={(v) => setInput(v)}
 *     onSend={handleSend}
 *     onAttach={handleAttach}
 *     placeholder="Ask anything about your pet…"
 *     sending={isLoading}
 *   />
 */

import * as React from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposerDockProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Optional slot for extra left-side actions (attach, image, etc.) */
  leftActions?: React.ReactNode;
  /** Optional slot for extra right-side actions before send */
  rightActions?: React.ReactNode;
  placeholder?: string;
  sending?: boolean;
  disabled?: boolean;
  className?: string;
  /** Override bottom offset (default: pb-[calc(env(safe-area-inset-bottom)+56px+8px)]) */
  bottomOffset?: string;
  maxRows?: number;
}

export function ComposerDock({
  value,
  onChange,
  onSend,
  leftActions,
  rightActions,
  placeholder = "Type a message…",
  sending = false,
  disabled = false,
  className,
}: ComposerDockProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea (max 6 rows)
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24 + 24)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !sending && value.trim()) onSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div
      className={cn(
        // Glass E2 — blur allowed on composer docks (§3.2)
        "fixed left-0 right-0 z-30 glass-e2",
        "border-t border-white/30",
        "px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+60px+8px)]",
        className,
      )}
      style={{ bottom: 0 }}
    >
      <div className="flex items-end gap-2 max-w-2xl mx-auto">
        {/* Left slot */}
        {leftActions && (
          <div className="flex items-center gap-1 flex-shrink-0 pb-1">
            {leftActions}
          </div>
        )}

        {/* Input area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className={cn(
              "w-full resize-none rounded-2xl bg-white/60 px-4 py-3",
              "text-sm text-[#424965] placeholder:text-[#424965]/40",
              "border border-white/40 outline-none",
              "focus:ring-2 focus:ring-[#2145CF]/30 focus:border-[#2145CF]/40",
              "transition-all duration-150",
              // iOS-safe font size (prevents zoom)
              "text-[16px] leading-6",
              disabled && "opacity-60",
            )}
            style={{ minHeight: 48, maxHeight: 168 }}
          />
        </div>

        {/* Right slot */}
        {rightActions && (
          <div className="flex items-center gap-1 flex-shrink-0 pb-1">
            {rightActions}
          </div>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className={cn(
            "flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center",
            "transition-all duration-150 active:scale-[0.96]",
            canSend
              ? "neu-primary text-white"
              : "bg-[#e8e8ee] text-[#424965]/30 shadow-none cursor-not-allowed",
          )}
          aria-label="Send"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
