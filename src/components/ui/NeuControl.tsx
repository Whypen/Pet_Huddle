/**
 * NeuControl — UI CONTRACT v6.1 § Section 6 Canonical
 *
 * Single primitive for ALL interactive button/control surfaces.
 * Replaces: NeuButton, v3/Button, shadcn/button (RULE 3).
 *
 * Shadow recipe: ALL 5 layers required on every state transition.
 *   Layer 1 — Base fill
 *   Layer 2 — Drop shadow (neutral ONLY: rgba(163,168,190,*))
 *   Layer 3 — Outer lift (rgba(255,255,255,*) or brand lift)
 *   Layer 4 — Inner bevel (inset top highlight)
 *   Layer 5 — Chamfer rim (border)
 *
 * Gold guard: variant="gold" ONLY renders gold styling when tier="gold" prop
 * is provided. Any other tier silently falls back to primary.
 *
 * Transitions: explicit properties ONLY — never "transition-all" (banned §9).
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Variant CSS classes (map to global.css §6 utility classes) ──────────────

const neuControlVariants = cva(
  // Base: layout, font, cursor, focus reset
  [
    "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap",
    "font-semibold font-[var(--font)]",
    "cursor-pointer",
    "focus-visible:outline-none",
    // Section 9: explicit property transitions (transition-all BANNED)
    "transition-[background,box-shadow,transform,border-color,opacity]",
    "duration-150",
    "[transition-timing-function:var(--ease-out)]",
    // Disabled via data attribute or HTML attr
    "data-[disabled=true]:opacity-[0.38] data-[disabled=true]:shadow-none data-[disabled=true]:pointer-events-none",
    "disabled:opacity-[0.38] disabled:shadow-none disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:   "neu-primary text-white",
        secondary: "neu-rest text-[var(--text-primary,#424965)]",
        tertiary:  "neu-tertiary text-[var(--text-secondary,#4a4a4a)]",
        danger:    "neu-danger text-[#E84545]",
        gold:      "neu-gold text-[#2A2400]",
      },
      size: {
        xl:      "h-[56px] px-8 rounded-[16px] text-[16px] font-bold [&_svg]:size-5",
        lg:      "h-[48px] px-7 rounded-[14px] text-[15px]    [&_svg]:size-[18px]",
        md:      "h-[40px] px-5 rounded-[12px] text-[14px]    [&_svg]:size-4",
        sm:      "h-[32px] px-4 rounded-[10px] text-[13px]    [&_svg]:size-3.5",
        "icon-lg": "h-[52px] w-[52px] px-0 rounded-[14px]     [&_svg]:size-6",
        "icon-md": "h-[40px] w-[40px] px-0 rounded-[12px]     [&_svg]:size-5",
        "icon-sm": "h-[32px] w-[32px] px-0 rounded-[10px]     [&_svg]:size-4",
      },
      fullWidth: {
        true:  "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant:   "primary",
      size:      "md",
      fullWidth: false,
    },
  },
);

// ── Props ────────────────────────────────────────────────────────────────────

export type NeuControlVariant = "primary" | "secondary" | "tertiary" | "danger" | "gold";
export type NeuControlSize    = "xl" | "lg" | "md" | "sm" | "icon-lg" | "icon-md" | "icon-sm";
export type NeuControlTier    = "free" | "plus" | "gold";

export interface NeuControlProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof neuControlVariants> {
  /** Which variant surface to render. "gold" requires tier="gold" to be active. */
  variant?: NeuControlVariant;
  /** Button height / padding tier. */
  size?: NeuControlSize;
  /** Whether to stretch to container width. */
  fullWidth?: boolean;
  /** Show spinner in place of children and disable pointer events. */
  loading?: boolean;
  /** Selected state — adds inset pressed-in shadow (chip-active, toggle-on). */
  selected?: boolean;
  /**
   * User subscription tier. Required to unlock gold variant.
   * If variant="gold" but tier!="gold", falls back to primary.
   */
  tier?: NeuControlTier;
}

// ── Component ────────────────────────────────────────────────────────────────

const NeuControl = React.forwardRef<HTMLButtonElement, NeuControlProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      selected = false,
      tier,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    // Gold guard: only allow gold surface when tier="gold"
    const resolvedVariant: NeuControlVariant =
      variant === "gold" && tier !== "gold" ? "primary" : variant;

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        data-disabled={isDisabled}
        data-selected={selected || undefined}
        className={cn(
          neuControlVariants({ variant: resolvedVariant, size, fullWidth }),
          // Selected state: inset bevel (chip-active / toggle-on)
          selected && "neu-selected",
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2
            className="animate-spin"
            size={size?.startsWith("icon") ? 20 : size === "sm" ? 14 : 16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          children
        )}
      </button>
    );
  },
);

NeuControl.displayName = "NeuControl";

export { NeuControl, neuControlVariants };
