/**
 * NannyCard — B.9
 * glass-card with image, avatar, service chips, rate, actions
 */

import React from "react";
import { BadgeCheck, MessageCircle, Calendar } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NannyCardProps {
  imageSrc?: string;
  imageAlt?: string;
  avatarSrc?: string;
  name: string;
  distance?: string;
  isVerified?: boolean;
  services?: string[];
  ratePerHour: string;
  availableNow?: boolean;
  onMessage?: () => void;
  onBook?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const NannyCard: React.FC<NannyCardProps> = ({
  imageSrc,
  imageAlt,
  avatarSrc,
  name,
  distance,
  isVerified = false,
  services = [],
  ratePerHour,
  availableNow = false,
  onMessage,
  onBook,
  className = "",
}) => {
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <article className={`glass-card overflow-hidden ${className}`}>
      {/* Image — aspect-[4/3] with gradient scrim */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-[20px_20px_0_0]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt ?? name}
            className="w-full h-full object-cover"
          />
        ) : (
          // Placeholder gradient when no image
          <div
            className="w-full h-full"
            style={{
              background: "linear-gradient(160deg, #BCCBE6 0%, #9AACD8 100%)",
            }}
            aria-hidden
          />
        )}
        {/* Gradient scrim — bottom h-1/3 */}
        <div
          className="absolute bottom-0 inset-x-0 h-1/3 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(66,73,101,0.55), transparent)" }}
          aria-hidden
        />
      </div>

      {/* Content */}
      <div className="px-[16px] py-[16px] space-y-[12px]">
        {/* Row 1: Avatar + Name + distance + verified */}
        <div className="flex items-center gap-[12px]">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={name}
              className="w-[40px] h-[40px] rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <span className="w-[40px] h-[40px] rounded-full bg-[rgba(33,69,207,0.10)] flex items-center justify-center text-[#2145CF] text-[15px] font-[600] flex-shrink-0">
              {initials}
            </span>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-[6px]">
              <span className="text-[16px] font-[600] leading-[1.25] text-[#424965] truncate">
                {name}
              </span>
              {isVerified && (
                <BadgeCheck
                  size={16}
                  strokeWidth={1.5}
                  className="text-[#2145CF] flex-shrink-0"
                  aria-label="Verified"
                />
              )}
            </div>
          </div>

          {/* Distance badge */}
          {distance && (
            <span className="text-[11px] font-[500] px-[8px] py-[3px] rounded-full bg-[rgba(255,255,255,0.55)] border border-[rgba(255,255,255,0.55)] text-[rgba(74,73,101,0.55)] flex-shrink-0">
              {distance}
            </span>
          )}
        </div>

        {/* Row 2: Service chips (horizontal scroll) */}
        {services.length > 0 && (
          <div className="flex gap-[6px] overflow-x-auto scrollbar-none pb-[2px]">
            {services.map((s) => (
              <span
                key={s}
                className="flex-shrink-0 text-[11px] font-[500] px-[10px] py-[4px] rounded-full bg-[rgba(33,69,207,0.08)] text-[#2145CF] border border-[rgba(33,69,207,0.10)]"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Row 3: Rate + availability dot */}
        <div className="flex items-center gap-[8px]">
          <span className="text-[16px] font-[600] leading-[1.25] text-[#424965]">
            {ratePerHour}
          </span>
          <span className="text-[13px] font-[500] text-[rgba(74,73,101,0.55)]">/hr</span>
          {availableNow && (
            <span className="flex items-center gap-[4px] ml-auto">
              <span className="w-[8px] h-[8px] rounded-full bg-[#22C55E]" aria-hidden />
              <span className="text-[11px] font-[400] text-[#22C55E]">Available</span>
            </span>
          )}
        </div>

        {/* Row 4: Actions */}
        <div className="flex gap-[12px]">
          {/* Message — GhostButton */}
          <button
            type="button"
            onClick={onMessage}
            className="flex-1 h-[44px] rounded-[14px] text-[14px] font-[600] text-[#424965] transition-all duration-150 active:scale-[0.96] active:bg-[rgba(255,255,255,0.45)]"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.50)",
            }}
          >
            <span className="flex items-center justify-center gap-[8px]">
              <MessageCircle size={16} strokeWidth={1.5} aria-hidden />
              Message
            </span>
          </button>

          {/* Book — PrimaryButton */}
          <button
            type="button"
            onClick={onBook}
            className="flex-1 h-[44px] rounded-[14px] text-[14px] font-[600] text-white transition-all duration-150 active:scale-[0.96]"
            style={{
              background: "linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%)",
              boxShadow: "6px 6px 14px rgba(33,69,207,0.30), -4px -4px 10px rgba(96,141,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <span className="flex items-center justify-center gap-[8px]">
              <Calendar size={16} strokeWidth={1.5} aria-hidden />
              Book
            </span>
          </button>
        </div>
      </div>
    </article>
  );
};

export default NannyCard;
