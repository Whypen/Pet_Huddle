/**
 * PaywallCTA — UI CONTRACT v6.1 § Section 6 / T8 Paywall
 *
 * Standalone "blackpill" upgrade prompt.
 * NOT a NeuControl variant — it has its own surface recipe.
 *
 * Spec (§ T8):
 *   height: 56px (--cta-height)
 *   border-radius: 9999px (full pill)
 *   background: #0D0D0D (literal, not var — first-frame safe)
 *   text: white, 15px semibold, Urbanist
 *   icon: Lucide, 18px, strokeWidth 1.75 (§8)
 *   layout: icon-left | icon-right | icon-only
 *   Tier badge: "Plus" | "Gold" chip in top-right corner of parent
 *
 * Usage:
 *   <PaywallCTA tier="plus" label="Unlock with Plus" />
 *   <PaywallCTA tier="gold" label="Upgrade to Gold" icon={<Star />} iconPosition="left" />
 */

import * as React from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaywallTier = "plus" | "gold";

export interface PaywallCTAProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** User tier gate that this CTA is advertising. */
  tier: PaywallTier;
  /** Button label text. */
  label?: string;
  /** Optional leading/trailing icon. Defaults to Lock when no icon given. */
  icon?: React.ReactNode;
  /** Where to place the icon relative to label. */
  iconPosition?: "left" | "right";
  /** Full-width stretches to container. */
  fullWidth?: boolean;
  /** Whether to show the tier badge chip (Plus / Gold) above the button. */
  showBadge?: boolean;
}

const TIER_BADGE: Record<PaywallTier, { label: string; className: string }> = {
  plus: {
    label: "Plus",
    className: "bg-[var(--blue,#2145CF)] text-white",
  },
  gold: {
    label: "Gold",
    className: "bg-[linear-gradient(135deg,#D9B528,#BF9B18)] text-[#2A2400]",
  },
};

const PaywallCTA = React.forwardRef<HTMLButtonElement, PaywallCTAProps>(
  (
    {
      tier,
      label,
      icon,
      iconPosition = "left",
      fullWidth = false,
      showBadge = false,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const badge   = TIER_BADGE[tier];
    const iconEl  = icon ?? <Lock size={18} strokeWidth={1.75} aria-hidden />;

    return (
      <div className={cn("flex flex-col items-start gap-1.5", fullWidth && "w-full")}>
        {/* Tier badge chip */}
        {showBadge && (
          <span
            className={cn(
              "inline-flex items-center h-[20px] px-2.5 rounded-full",
              "text-[11px] font-bold tracking-[0.04em] uppercase",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        )}

        {/* Blackpill button */}
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            // Blackpill surface — NOT neumorphic, standalone spec
            "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap",
            // Exact spec values
            "h-[56px] px-8 rounded-full",
            "bg-[#0D0D0D] text-white",
            // Typography
            "text-[15px] font-semibold font-[var(--font)]",
            // Subtle inner highlight so it reads on dark backgrounds
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_16px_rgba(0,0,0,0.24)]",
            // Motion (explicit, no transition-all)
            "transition-[transform,box-shadow,opacity] duration-150",
            "[transition-timing-function:var(--ease-out)]",
            "active:scale-[0.97] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.18)]",
            // Width
            fullWidth && "w-full",
            // Disabled
            "disabled:opacity-[0.38] disabled:pointer-events-none",
            // Focus
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D]",
            className,
          )}
          {...props}
        >
          {iconPosition === "left"  && <span aria-hidden>{iconEl}</span>}
          {label && <span>{label}</span>}
          {iconPosition === "right" && <span aria-hidden>{iconEl}</span>}
        </button>
      </div>
    );
  },
);

PaywallCTA.displayName = "PaywallCTA";

export { PaywallCTA };
