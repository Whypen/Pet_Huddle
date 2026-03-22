/**
 * FilterChip — UI CONTRACT v3 — B.6 / B.9
 *
 * Toggle pill for filter bars and broadcast modal radius chips.
 *
 * Unselected: SecondaryButton-style neumorphic neutral (smaller, rounded-full)
 * Selected:   Blue fill — same neu-primary shadow family
 *
 * Used in:
 *  — C.6 Marketplace filter bar (horizontal scroll, h-8 px-4)
 *  — B.9 Broadcast modal radius chips
 *
 * Size: compact (h-8 / 32px) — default for filter bars
 *       default (h-9 / 36px) — for broadcast modal chips
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type FilterChipSize = "compact" | "default";

export interface FilterChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  selected?: boolean;
  size?:     FilterChipSize;
  onChange?: (selected: boolean) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  (
    {
      selected  = false,
      size      = "compact",
      onChange,
      onClick,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onChange?.(!selected);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={selected}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          // Layout
          "inline-flex items-center justify-center gap-[8px] select-none whitespace-nowrap rounded-full",
          // Size
          size === "compact"
            ? "h-[32px] px-[16px] text-[13px] font-medium"
            : "h-[36px] px-[16px] text-[13px] font-medium",
          // Motion
          "transition-all duration-150 ease-out",
          // Active press
          "active:scale-[0.96]",
          // Disabled
          "disabled:opacity-[0.38] disabled:pointer-events-none disabled:shadow-none",
          // Focus
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2145CF]",
          // ── State: Unselected (SecondaryButton family) ──
          !selected && [
            "bg-[rgba(255,255,255,0.80)] text-[#424965]",
            "shadow-[5px_5px_12px_rgba(0,87,255,0.12),-4px_-4px_10px_rgba(255,255,255,0.90),inset_0_1px_0_rgba(255,255,255,0.80)]",
          ],
          // ── State: Selected (PrimaryButton family) ──
          selected && [
            "bg-gradient-to-br from-[#2A53E0] to-[#1C3ECC] text-white",
            "shadow-[6px_6px_14px_rgba(33,69,207,0.30),-4px_-4px_10px_rgba(96,141,255,0.45),inset_0_1px_0_rgba(255,255,255,0.18)]",
          ],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

FilterChip.displayName = "FilterChip";
