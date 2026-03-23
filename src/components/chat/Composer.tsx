/**
 * Composer — B.8
 * glass-bar fixed bottom; textarea auto-grow; send button spring appear/disappear
 */

import React, { useRef, useEffect, useState } from "react";
import { Paperclip, Camera, Send } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  onCamera?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** extra bottom offset when a bottom nav is present (default: 64) */
  navOffset?: number;
  onHeightChange?: (height: number) => void;
  showAttach?: boolean;
  showCamera?: boolean;
  alwaysShowSend?: boolean;
  hideTopBorder?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSend,
  onAttach,
  onCamera,
  placeholder = "Message…",
  disabled = false,
  navOffset = 64,
  onHeightChange,
  showAttach = true,
  showCamera = true,
  alwaysShowSend = false,
  hideTopBorder = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSendVisible, setIsSendVisible] = useState(false);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 120);
    ta.style.height = `${Math.max(40, next)}px`;
  }, [value]);

  // Show/hide send button
  useEffect(() => {
    setIsSendVisible(alwaysShowSend || value.trim().length > 0);
  }, [alwaysShowSend, value]);

  useEffect(() => {
    if (!rootRef.current || !onHeightChange) return;
    const node = rootRef.current;
    const report = () => onHeightChange(node.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeightChange, value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (not Shift+Enter) on desktop
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
      const isMobile = "ontouchstart" in window;
      if (!isMobile) {
        e.preventDefault();
        if (value.trim()) onSend();
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className="glass-bar fixed inset-x-0 z-[40]"
      style={{ bottom: `${navOffset}px`, borderTop: hideTopBorder ? "none" : undefined, boxShadow: hideTopBorder ? "none" : undefined }}
      data-testid="composer-dock"
    >
      <div
        className="mx-auto flex w-full max-w-[430px] items-end gap-[12px] px-[16px] pt-[10px]"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 10px)` }}
      >
        {/* Attach icon */}
        {showAttach && (
          <button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            className="flex-shrink-0 w-[40px] h-[40px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] transition-colors duration-150 disabled:opacity-[0.38] disabled:pointer-events-none"
            aria-label="Attach file"
          >
            <Paperclip size={20} strokeWidth={1.5} />
          </button>
        )}

        {/* Camera icon */}
        {showCamera && (
          <button
            type="button"
            onClick={onCamera}
            disabled={disabled}
            className="flex-shrink-0 w-[40px] h-[40px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] transition-colors duration-150 disabled:opacity-[0.38] disabled:pointer-events-none"
            aria-label="Camera"
          >
            <Camera size={20} strokeWidth={1.5} />
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={[
            "flex-1 min-h-[40px] max-h-[120px] rounded-[14px] resize-none overflow-hidden",
            "bg-[rgba(255,255,255,0.55)] border border-[rgba(255,255,255,0.55)]",
            "shadow-[inset_2px_2px_6px_rgba(0,87,255,0.10)]",
            "px-[14px] py-[10px]",
            "text-[16px] leading-[1.4] text-[#424965]",
            "placeholder:text-[rgba(66,73,101,0.38)]",
            "outline-none",
            "focus:border-[rgba(33,69,207,0.50)] focus:shadow-[inset_2px_2px_6px_rgba(0,87,255,0.10),0_0_0_2px_rgba(33,69,207,0.20)]",
            "transition-[border-color,box-shadow] duration-150",
            "disabled:opacity-[0.38] disabled:pointer-events-none",
          ].join(" ")}
          aria-label="Message input"
        />

        {/* Send button — spring appear/disappear */}
        <button
          type="button"
          onClick={() => { if (value.trim()) onSend(); }}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex-shrink-0 w-[40px] h-[40px] rounded-full flex items-center justify-center text-white"
          style={{
            background: "linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%)",
            boxShadow: "6px 6px 14px rgba(33,69,207,0.30), -4px -4px 10px rgba(96,141,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
            transform: isSendVisible ? "scale(1)" : "scale(0)",
            opacity: isSendVisible ? 1 : 0,
            transition: isSendVisible
              ? "transform 150ms cubic-bezier(0.34,1.20,0.64,1), opacity 150ms cubic-bezier(0.34,1.20,0.64,1)"
              : "transform 100ms ease-in, opacity 100ms ease-in",
            pointerEvents: isSendVisible ? "auto" : "none",
          }}
        >
          <Send size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default Composer;
