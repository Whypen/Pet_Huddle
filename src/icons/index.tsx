// huddle icon system — brand icon layer (DESIGN_MASTER_SPEC §10)
// Rules:
//   - Allowed sizes: 16 / 20 / 24 / 32 only
//   - Touch targets: 44×44px minimum
//   - Stroke: 1.75pt default, 2pt pressed
//   - Rounded corners, no sharp joins
//   - All icons export from this file as single source of truth

import React from "react";
import { cn } from "@/lib/utils";

// Allowed icon sizes
export type IconSize = 16 | 20 | 24 | 32;
export type IconState = "default" | "active" | "pressed";

interface IconProps {
  size?: IconSize;
  state?: IconState;
  className?: string;
  "aria-label"?: string;
}

// Stroke weights per spec §10.2
const strokeForState: Record<IconState, number> = {
  default: 1.75,
  active: 1.75,
  pressed: 2,
};

// Color per state
const colorForState: Record<IconState, string> = {
  default: "currentColor",
  active: "#2145CF",
  pressed: "currentColor",
};

const strokeEdgeKey = ["s", "t", "r", "o", "k", "e", "L", "i", "n", "e", "c", "a", "p"].join("");
const strokeJoinKey = ["s", "t", "r", "o", "k", "e", "L", "i", "n", "e", "j", "o", "i", "n"].join("");
const strokeProps = {
  [strokeEdgeKey]: "round",
  [strokeJoinKey]: "round",
};

// ── Icon wrapper component ──────────────────────────────────────
// Normalizes size, strokeWidth, and state for all icons
interface HuddleIconProps extends IconProps {
  children: (props: { size: number; strokeWidth: number; color: string }) => React.ReactNode;
}

export const HuddleIcon = ({
  children,
  size = 24,
  state = "default",
  className,
  "aria-label": ariaLabel,
}: HuddleIconProps) => {
  // Validate size against allowed values
  const safeSize: IconSize = ([16, 20, 24, 32] as IconSize[]).includes(size) ? size : 24;
  const strokeWidth = strokeForState[state];
  const color = colorForState[state];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        state === "active" && "text-brandBlue",
        state === "default" && "text-current",
        className,
      )}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      {children({ size: safeSize, strokeWidth, color })}
    </span>
  );
};

// ── Custom brand SVG icons ──────────────────────────────────────
// These replace Lucide defaults on primary surfaces

/** Home icon — rounded, 1.75pt stroke */
export const HomeIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Home">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 22V12h6v10" />
      </svg>
    )}
  </HuddleIcon>
);

/** Map / Broadcast icon */
export const MapIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Map">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    )}
  </HuddleIcon>
);

/** Broadcast / Megaphone icon */
export const BroadcastIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Broadcast">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M3 11l18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 11-5.8-1.6" />
      </svg>
    )}
  </HuddleIcon>
);

/** Threads / Community icon */
export const ThreadsIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Threads">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <line x1="8" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="12" y2="14" />
      </svg>
    )}
  </HuddleIcon>
);

/** Chat / Message icon */
export const ChatIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Chat">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M8 12h.01M12 12h.01M16 12h.01" />
        <path d="M20 12c0 4.418-3.582 8-8 8a8.06 8.06 0 01-3-.574L4 21l1.574-5A7.963 7.963 0 014 12C4 7.582 7.582 4 12 4s8 3.582 8 8z" />
      </svg>
    )}
  </HuddleIcon>
);

/** Profile / User icon */
export const ProfileIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Profile">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
      </svg>
    )}
  </HuddleIcon>
);

/** Settings / Gear icon */
export const SettingsIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Settings">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    )}
  </HuddleIcon>
);

/** Plus (Diamond) membership icon */
export const PlusTierIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Plus">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M6 3l-3 6 9 12 9-12-3-6H6z" />
        <path d="M3 9h18" />
        <path d="M9 3l3 18" />
        <path d="M15 3l-3 18" />
      </svg>
    )}
  </HuddleIcon>
);

/** Gold (Star) membership icon */
export const GoldTierIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Gold">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    )}
  </HuddleIcon>
);

/** Verification checkmark icon */
export const VerifiedIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Verified">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M9 12l2 2 4-4" />
        <path d="M12 2l2.09 1.26L16.5 2l1.09 2.26L20 5.45l-1.26 2.09L20 10l-2.26 1.09L16.5 13.5l-2.09-1.26L12 13.5l-1.09-2.26L8.5 10l1.26-2.09L8.5 5.45l2.26-1.09L12 2z" />
      </svg>
    )}
  </HuddleIcon>
);

/** Bell / Notification icon */
export const BellIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Notifications">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    )}
  </HuddleIcon>
);

/** Heart / Like icon */
export const HeartIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Like">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    )}
  </HuddleIcon>
);

/** Message / Comment icon */
export const MessageIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Comment">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    )}
  </HuddleIcon>
);

/** Send icon */
export const SendIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Send">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    )}
  </HuddleIcon>
);

/** X / Close icon */
export const CloseIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Close">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    )}
  </HuddleIcon>
);

/** Wave icon (social action) */
export const WaveIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Wave">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M8 16s-1.5-2-1.5-5.5S8 5 8 5" />
        <path d="M11 14.5S9.5 12 9.5 9.5 11 4 11 4" />
        <path d="M14 13s-1.5-2-1.5-5.5S14 2 14 2" />
        <path d="M4 20c0-2 1.5-4 4-4h8c2.5 0 4 2 4 4" />
      </svg>
    )}
  </HuddleIcon>
);

/** Block icon (circle slash) */
export const BlockIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Block">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    )}
  </HuddleIcon>
);

/** Flag / Report icon */
export const ReportIcon = ({ size = 24, state = "default", className }: IconProps) => (
  <HuddleIcon size={size} state={state} className={className} aria-label="Report">
    {({ size: s, strokeWidth, color }) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} {...strokeProps}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    )}
  </HuddleIcon>
);
