/**
 * ExploreGroupCard — Chats > Groups > Explore
 *
 * Shell + cover layout lifted 1:1 from the dead /marketplace NannyCard.
 * Differences from NannyCard (data-driven, not styling):
 *  - basic info (name, verified, location) overlays the bottom of the cover
 *  - service/rate row replaced with pet-focus chip row
 *  - two-button action row replaced with single full-width CTA driven by 5 states
 *  - cover fallback is the Huddle Blue gradient, not lavender
 *
 * Glass-card class is the existing tokenized surface (src/styles/global.css).
 * No new tokens, no new packages, no new queries.
 */

import React from "react";
import { BadgeCheck, ChevronRight, MapPin } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExploreGroupCardCTA =
  | { kind: "join"; onJoin: () => void }
  | { kind: "request"; onRequest: () => void }
  | { kind: "requested" }
  | { kind: "invited"; onAccept: () => void }
  | { kind: "open"; onOpen: () => void };

// Structural type — accepts the Chats.tsx `Group` shape without coupling to it.
export interface ExploreGroupCardData {
  id: string;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  petFocus?: string[] | null;
  locationLabel?: string | null;
  description?: string | null;
  isVerified?: boolean | null;
}

export interface ExploreGroupCardProps {
  group: ExploreGroupCardData;
  cta: ExploreGroupCardCTA;
  onCardOpen: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ExploreGroupCard: React.FC<ExploreGroupCardProps> = ({
  group,
  cta,
  onCardOpen,
  className = "",
}) => {
  const petTags = (group.petFocus ?? []).slice(0, 4);
  const memberLabel = `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`;

  return (
    <article className={`glass-card overflow-hidden ${className}`}>
      {/* Cover — aspect-[16/9] with deeper bottom scrim because text + chips overlay it */}
      <button
        type="button"
        onClick={onCardOpen}
        aria-label={`Open ${group.name} details`}
        className="relative block w-full aspect-[16/9] overflow-hidden rounded-[20px_20px_0_0] text-left"
      >
        {group.avatarUrl ? (
          <img
            src={group.avatarUrl}
            alt={group.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: "linear-gradient(160deg, #2145CF 0%, #3A5FE8 100%)",
            }}
            aria-hidden
          />
        )}

        {/* Bottom scrim — covers ~70% so chips + name + location stay legible */}
        <div
          className="absolute bottom-0 inset-x-0 h-[70%] pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(20,24,38,0.78), rgba(20,24,38,0.10) 60%, transparent)" }}
          aria-hidden
        />

        {/* Member count pill — top-right */}
        <span
          className="absolute top-3 right-3 text-[11px] font-[500] px-[10px] py-[4px] rounded-full text-white"
          style={{ background: "rgba(20,24,38,0.55)" }}
        >
          {memberLabel}
        </span>

        {/* Basic info overlay — bottom-left, profile-card style */}
        <div className="absolute bottom-3 left-4 right-4 flex flex-col gap-[4px]">
          <div className="flex items-center gap-[6px] min-w-0">
            <span className="text-[18px] font-[600] leading-[1.2] text-white truncate drop-shadow-sm">
              {group.name}
            </span>
            {group.isVerified ? (
              <BadgeCheck
                size={16}
                strokeWidth={1.5}
                className="text-white/95 flex-shrink-0"
                aria-label="Verified"
              />
            ) : null}
          </div>
          {group.locationLabel ? (
            <span className="flex items-center gap-[4px] text-[12px] font-[500] text-white/85 truncate">
              <MapPin size={12} strokeWidth={1.75} className="flex-shrink-0" aria-hidden />
              {group.locationLabel}
            </span>
          ) : null}
          {petTags.length > 0 ? (
            <div className="flex gap-[6px] overflow-x-auto scrollbar-none pb-[2px] -mx-1 px-1">
              {petTags.map((tag) => (
                <span
                  key={tag}
                  className="flex-shrink-0 text-[10px] font-[500] uppercase tracking-[0.04em] px-[8px] py-[3px] rounded-full text-white"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(255,255,255,0.28)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>

      {/* Body — description (optional) + CTA */}
      <div className="px-[16px] py-[14px] space-y-[10px]">
        {group.description ? (
          <p className="text-[13px] leading-relaxed text-[rgba(74,73,101,0.70)] line-clamp-2 break-words">
            {group.description}
          </p>
        ) : null}

        <CTAButton cta={cta} groupName={group.name} />
      </div>
    </article>
  );
};

// ─── CTA button ───────────────────────────────────────────────────────────────

function CTAButton({ cta, groupName }: { cta: ExploreGroupCardCTA; groupName: string }) {
  const baseClass =
    "w-full h-[44px] rounded-full text-[14px] font-[600] flex items-center justify-center gap-[6px] transition-all duration-150 active:scale-[0.97]";

  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  switch (cta.kind) {
    case "join":
      return (
        <button
          type="button"
          aria-label={`Join ${groupName}`}
          className={`${baseClass} text-white`}
          style={{
            background: "linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%)",
            boxShadow:
              "6px 6px 14px rgba(33,69,207,0.30), -4px -4px 10px rgba(96,141,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
          onClick={(e) => stop(e, cta.onJoin)}
        >
          Join
        </button>
      );

    case "request":
      return (
        <button
          type="button"
          aria-label={`Request to join ${groupName}`}
          className={`${baseClass}`}
          style={{
            background: "transparent",
            border: "1px solid #2145CF",
            color: "#2145CF",
          }}
          onClick={(e) => stop(e, cta.onRequest)}
        >
          Request to join
        </button>
      );

    case "requested":
      return (
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="Join request pending"
          className={`${baseClass}`}
          style={{
            background: "rgba(74,73,101,0.08)",
            color: "rgba(74,73,101,0.55)",
            pointerEvents: "none",
          }}
        >
          Requested
        </button>
      );

    case "invited":
      return (
        <button
          type="button"
          aria-label={`Accept invite to ${groupName}`}
          className={`${baseClass} text-white`}
          style={{
            background: "linear-gradient(145deg, #FF7F50 0%, #F26233 100%)",
            boxShadow:
              "6px 6px 14px rgba(255,127,80,0.28), -4px -4px 10px rgba(255,180,140,0.40), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
          onClick={(e) => stop(e, cta.onAccept)}
        >
          You&apos;re invited
        </button>
      );

    case "open":
      return (
        <button
          type="button"
          aria-label={`Open ${groupName}`}
          className={`${baseClass}`}
          style={{
            background: "transparent",
            border: "1px solid #2145CF",
            color: "#2145CF",
          }}
          onClick={(e) => stop(e, cta.onOpen)}
        >
          Open
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      );
  }
}

export default ExploreGroupCard;
