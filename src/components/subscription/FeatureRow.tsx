/**
 * FeatureRow — B.6.1
 * h-[42px] flex items-center gap-3 px-1
 * icon: check (success) / dash (tertiary) / lock (gold — Gold tier ONLY)
 * badge: Plus (blue-surface/blue) / Gold (gold-surface/gold — Gold tier only)
 */

import React from "react";
import { Check, Minus, Lock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeatureRowIcon = "check" | "dash" | "lock";
export type FeatureRowBadge = "plus" | "gold" | null;

export interface FeatureRowProps {
  label: string;
  icon?: FeatureRowIcon;
  badge?: FeatureRowBadge;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FeatureRow: React.FC<FeatureRowProps> = ({
  label,
  icon = "check",
  badge = null,
  className = "",
}) => {
  const iconEl =
    icon === "check" ? (
      <Check size={16} strokeWidth={1.5} className="text-[#22C55E] flex-shrink-0" aria-hidden />
    ) : icon === "lock" ? (
      // lock — Gold tier ONLY
      <Lock size={16} strokeWidth={1.5} className="text-[#CFAB21] flex-shrink-0" aria-hidden />
    ) : (
      <Minus size={16} strokeWidth={1.5} className="text-[rgba(74,73,101,0.55)] flex-shrink-0" aria-hidden />
    );

  const badgeEl =
    badge === "plus" ? (
      <span className="ml-auto text-[10px] font-[500] leading-[1.4] tracking-[0.01em] uppercase px-[8px] py-[2px] rounded-full bg-[rgba(33,69,207,0.08)] text-[#2145CF] flex-shrink-0">
        Plus
      </span>
    ) : badge === "gold" ? (
      // Gold badge — Gold tier ONLY
      <span className="ml-auto text-[10px] font-[500] leading-[1.4] tracking-[0.01em] uppercase px-[8px] py-[2px] rounded-full bg-[rgba(207,171,33,0.10)] text-[#CFAB21] flex-shrink-0">
        Gold
      </span>
    ) : null;

  return (
    <div
      className={`h-[42px] flex items-center gap-[12px] px-[4px] ${className}`}
    >
      {iconEl}
      <span className="text-[13px] font-[500] leading-[1.40] tracking-[0.01em] text-[#424965] flex-1 max-w-[36ch]">
        {label}
      </span>
      {badgeEl}
    </div>
  );
};

export default FeatureRow;
