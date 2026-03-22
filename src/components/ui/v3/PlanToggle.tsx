/**
 * PlanToggle — UI CONTRACT v3 — B.6.1
 *
 * Monthly / Annual pill toggle for the scrollable /subscription route fallback.
 * NOT used inside PaywallModal (which uses tile cards directly).
 *
 * Container: inline-flex, rounded-full, p-1, gap-0.5
 *   bg: rgba(255,255,255,0.42), backdrop-blur-[12px], border white/55
 *
 * Active pill:
 *   bg: rgba(255,255,255,0.85), rounded-full, h-[34px], px-[22px]
 *   shadow: 3px 3px 8px rgba(0,87,255,0.14), -2px -2px 5px rgba(255,255,255,0.88)
 *   text: 13px/500, #424965
 *
 * Save badge (Gold color ONLY for Gold-tier annual discount — B.6.1, D.21):
 *   position absolute, top-[-10px] right-[-8px]
 *   bg: #CFAB21, text white, 10px/500, px-[8px] py-[2px] rounded-full
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type BillingPeriod = "monthly" | "annual";

export interface PlanToggleProps {
  value:          BillingPeriod;
  onChange:       (period: BillingPeriod) => void;
  /** Displayed in the save badge — shown only on annual option. Gold color. */
  annualSavePct?: string;
  className?:     string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function PlanToggle({
  value,
  onChange,
  annualSavePct,
  className,
}: PlanToggleProps) {
  const options: { key: BillingPeriod; label: string }[] = [
    { key: "monthly", label: "Monthly" },
    { key: "annual",  label: "Annual"  },
  ];

  return (
    <div
      role="group"
      aria-label="Billing period"
      className={cn(
        // B.6.1 container
        "inline-flex rounded-full p-[4px] gap-[2px]",
        "bg-[rgba(255,255,255,0.42)]",
        "backdrop-blur-[12px]",
        "-webkit-backdrop-filter backdrop-blur-[12px]",
        "border border-[rgba(255,255,255,0.55)]",
        className,
      )}
    >
      {options.map(({ key, label }) => {
        const isActive  = value === key;
        const isAnnual  = key === "annual";
        const showBadge = isAnnual && !!annualSavePct;

        return (
          <div key={key} className="relative">
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(key)}
              className={cn(
                // B.6.1 pill
                "h-[34px] px-[22px] rounded-full",
                "text-[13px] font-medium text-[#424965] leading-[1.40] tracking-[0.01em]",
                // Motion
                "transition-all duration-150 ease-out",
                "select-none whitespace-nowrap",
                // Active pill styles (B.6.1)
                isActive && [
                  "bg-[rgba(255,255,255,0.85)]",
                  "shadow-[3px_3px_8px_rgba(0,87,255,0.14),-2px_-2px_5px_rgba(255,255,255,0.88)]",
                ],
                !isActive && "text-[rgba(74,73,101,0.55)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2145CF]",
              )}
            >
              {label}
            </button>

            {/* Save badge — Gold color, Gold-tier annual discount ONLY (B.6.1, D.21) */}
            {showBadge && (
              <span
                aria-label={`Save ${annualSavePct}`}
                className={cn(
                  "absolute top-[-10px] right-[-8px]",
                  "bg-[#CFAB21] text-white",
                  "text-[10px] font-medium leading-none",
                  "px-[8px] py-[2px] rounded-full",
                  "pointer-events-none select-none",
                )}
              >
                {annualSavePct}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

PlanToggle.displayName = "PlanToggle";
