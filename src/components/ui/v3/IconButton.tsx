/**
 * IconButton — UI CONTRACT v3 — B.2 (IconButton section)
 *
 * sizes: sm (32×32, radius 10px) | md (40×40, radius 12px) | lg (48×48, radius 12px)
 *
 * Neumorphic raised surface — same shadow family as Button but lighter.
 * Children should be a Lucide icon at strokeWidth={1.5} (A.7).
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?:    IconButtonSize;
  loading?: boolean;
  /** Accessible label — required for screen readers */
  label:    string;
}

// ─── B.2 IconButton size strings ────────────────────────────────────────────

const SIZES: Record<IconButtonSize, string> = {
  sm: "w-[32px] h-[32px] rounded-[10px]",
  md: "w-[40px] h-[40px] rounded-[12px]",
  lg: "w-[48px] h-[48px] rounded-[12px]",
};

// ─── Component ─────────────────────────────────────────────────────────────

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      size    = "md",
      loading = false,
      label,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(
        // Layout
        "inline-flex items-center justify-center flex-shrink-0",
        // B.2 IconButton surface
        "bg-[rgba(255,255,255,0.72)]",
        // B.2 IconButton shadow (neu-icon)
        "shadow-[4px_4px_10px_rgba(0,87,255,0.12),-3px_-3px_8px_rgba(255,255,255,0.88),inset_0_1px_0_rgba(255,255,255,0.75)]",
        // Active press (A.8 — scale 0.96, 150ms)
        "active:scale-[0.96]",
        "active:shadow-[inset_3px_3px_8px_rgba(0,87,255,0.10),inset_-2px_-2px_6px_rgba(255,255,255,0.70)]",
        // Motion
        "transition-all duration-150 ease-out",
        // Disabled — B.2 Disabled
        "disabled:opacity-[0.38] disabled:shadow-none disabled:pointer-events-none",
        // Focus
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2145CF]",
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin text-[#424965]" strokeWidth={1.5} />
        : children}
    </button>
  ),
);

IconButton.displayName = "IconButton";
