/**
 * ChatBubble — B.8
 * variants: sent | received | ai
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BubbleVariant = "sent" | "received" | "ai";

export interface ChatBubbleProps {
  variant: BubbleVariant;
  children: React.ReactNode;
  /** AI variant: show typing indicator instead of children */
  typing?: boolean;
  /** AI variant: avatar src */
  avatarSrc?: string;
  className?: string;
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <span className="flex items-center gap-[5px] h-[22px] px-[2px]" aria-label="Typing">
    {[0, 120, 240].map((delay) => (
      <span
        key={delay}
        className="inline-block w-[6px] h-[6px] rounded-full bg-[#2145CF]"
        style={{
          animation: `v3-dot-bounce 800ms ${delay}ms cubic-bezier(0.4,0,0.2,1) infinite`,
        }}
      />
    ))}
    {/* Keyframes injected once via global.css — replicated here as fallback */}
    <style>{`
      @keyframes v3-dot-bounce {
        0%, 80%, 100% { transform: scale(0.4); opacity: 0.5; }
        40%            { transform: scale(1.0); opacity: 1; }
      }
    `}</style>
  </span>
);

// ─── ChatBubble ───────────────────────────────────────────────────────────────

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  variant,
  children,
  typing = false,
  avatarSrc,
  className = "",
}) => {
  // ─── Sent ───────────────────────────────────────────────────────────────────
  if (variant === "sent") {
    return (
      <div
        className={[
          "max-w-[72%] self-end",
          "bg-[linear-gradient(135deg,#2A53E0_0%,#1C3ECC_100%)]",
          "text-white",
          "rounded-[20px_20px_4px_20px]",
          "px-[14px] py-[10px]",
          "text-[15px] leading-[1.5]",
          "shadow-[0_4px_14px_rgba(33,69,207,0.28)]",
          className,
        ].join(" ")}
      >
        {children}
      </div>
    );
  }

  // ─── Received ───────────────────────────────────────────────────────────────
  if (variant === "received") {
    return (
      <div
        className={[
          "max-w-[72%] self-start",
          "bg-[rgba(255,255,255,0.70)]",
          "backdrop-blur-[14px]",
          "border border-[rgba(255,255,255,0.55)]",
          "rounded-[20px_20px_20px_4px]",
          "px-[14px] py-[10px]",
          "text-[15px] leading-[1.5]",
          "text-[#424965]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
          className,
        ].join(" ")}
      >
        {children}
      </div>
    );
  }

  // ─── AI (Dr. Huddle) ─────────────────────────────────────────────────────────
  // "Avatar 28px + 'Dr. Huddle' 11px/500 shown above bubble"
  return (
    <div className={`max-w-[88%] self-start flex flex-col gap-[4px] ${className}`}>
      {/* Label row above bubble */}
      <div className="flex items-center gap-[6px] pl-[2px]">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt="Dr. Huddle"
            className="w-[28px] h-[28px] rounded-full object-cover"
          />
        ) : (
          <span
            className="w-[28px] h-[28px] rounded-full bg-[rgba(33,69,207,0.12)] flex items-center justify-center text-[11px] font-medium text-[#2145CF]"
            aria-hidden
          >
            🐾
          </span>
        )}
        <span className="text-[11px] font-[500] text-[#4a4a4a]">Dr. Huddle</span>
      </div>

      {/* Bubble */}
      <div
        className={[
          "bg-[rgba(255,255,255,0.70)]",
          "backdrop-blur-[14px]",
          "border border-[rgba(255,255,255,0.55)]",
          "border-l-[3px] border-l-[#2145CF]",
          "rounded-[4px_20px_20px_20px]",
          "px-[14px] py-[10px]",
          "text-[15px] leading-[1.5]",
          "text-[#424965]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
        ].join(" ")}
      >
        {typing ? <TypingIndicator /> : children}
      </div>
    </div>
  );
};

export default ChatBubble;
