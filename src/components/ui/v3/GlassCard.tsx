/**
 * GlassCard — UI CONTRACT v3 — B.1
 *
 * levels:  card (L1 — glass-card)  | l2 (L2 — glass-l2) | l3 (L3 — glass-l3)
 * props:   noise  — adds subtle noise texture overlay
 *          scrim  — adds gradient scrim at bottom (for image cards)
 *          loading — skeleton shimmer covers content zone
 *          disabled — opacity-50 pointer-events-none
 *
 * Glass utility classes defined in global.css; tokens in tokens.css.
 * NO ad-hoc backdrop-filter here — only via the 5 defined classes (D.2).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type GlassLevel = "card" | "l2" | "l3";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  level?:    GlassLevel;
  noise?:    boolean;
  scrim?:    boolean;
  loading?:  boolean;
  disabled?: boolean;
  /** padding override — defaults to contract padding per level */
  noPadding?: boolean;
}

// Maps level to the global.css utility class (A.2)
const LEVEL_CLASS: Record<GlassLevel, string> = {
  card: "glass-card",
  l2:   "glass-l2",
  l3:   "glass-l3",
};

// ─── Skeleton shimmer overlay ───────────────────────────────────────────────

function SkeletonShimmer() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 rounded-[inherit] overflow-hidden pointer-events-none"
    >
      <div className="absolute inset-0 animate-[v3-shimmer_1400ms_linear_infinite] bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] bg-[length:200%_100%]" />
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      level    = "card",
      noise    = false,
      scrim    = false,
      loading  = false,
      disabled = false,
      noPadding = false,
      className,
      children,
      style,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        // Core glass surface (B.1 — class defined in global.css)
        LEVEL_CLASS[level],
        // B.1 hover: shadow expands 1.15x, 200ms, no transform
        "transition-shadow duration-200",
        // B.1 disabled
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      style={style}
      {...props}
    >
      {/* Noise texture overlay — subtle grain for depth */}
      {noise && (
        <div
          aria-hidden
          className="absolute inset-0 z-[1] pointer-events-none opacity-[0.035] rounded-[inherit]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
            backgroundRepeat: "repeat",
            backgroundSize: "128px 128px",
          }}
        />
      )}

      {/* Skeleton shimmer (B.1 loading) */}
      {loading && <SkeletonShimmer />}

      {/* Gradient scrim — bottom third, for image cards (B.9 NannyCard) */}
      {scrim && (
        <div
          aria-hidden
          className="absolute bottom-0 inset-x-0 h-1/3 z-[2] pointer-events-none rounded-b-[inherit]"
          style={{
            background:
              "linear-gradient(to top, rgba(66,73,101,0.55) 0%, transparent 100%)",
          }}
        />
      )}

      {/* Content — z-index above overlays */}
      <div className={cn("relative z-[3]", !noPadding && "")}>
        {children}
      </div>
    </div>
  ),
);

GlassCard.displayName = "GlassCard";
