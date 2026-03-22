/**
 * PricingCard — B.6.1
 * Scrollable-page fallback only (not the primary PaywallModal).
 * class: glass-l2; max-w-320px; p-24px; space-y-5
 * CTA: PrimaryButton (Plus) or GoldButton (Gold tier only)
 */

import React from "react";
import { Zap, Star } from "lucide-react";
import { FeatureRow, FeatureRowProps } from "./FeatureRow";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PricingCardTier = "plus" | "gold";

export interface PricingCardProps {
  tier: PricingCardTier;
  price: string;
  billedNote?: string;
  features: Omit<FeatureRowProps, "className">[];
  ctaLabel?: string;
  onCta?: () => void;
  recommended?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PricingCard: React.FC<PricingCardProps> = ({
  tier,
  price,
  billedNote,
  features,
  ctaLabel,
  onCta,
  recommended = false,
  className = "",
}) => {
  const isGold = tier === "gold";

  return (
    <div
      className={[
        "glass-l2 max-w-[320px] w-full",
        "space-y-[20px]",
        recommended
          ? "ring-2 ring-white/55 scale-[1.02] shadow-[0_20px_48px_rgba(0,87,255,0.22)]"
          : "",
        className,
      ].join(" ")}
      style={{ padding: "24px" }}
    >
      {/* Header: Icon + tier name */}
      <div className="flex items-center gap-[12px]">
        {isGold ? (
          <Star
            size={28}
            strokeWidth={1.5}
            className="text-[#CFAB21]"
            aria-hidden
          />
        ) : (
          <Zap
            size={28}
            strokeWidth={1.5}
            className="text-[#2145CF]"
            aria-hidden
          />
        )}
        <h2 className="text-[18px] font-[600] leading-[1.20] tracking-[-0.01em] text-[#424965]">
          {isGold ? "Gold" : "Plus"}
        </h2>
      </div>

      {/* Price */}
      <div>
        <div className="flex items-baseline gap-[4px]">
          <span className="text-[32px] font-[700] leading-[1.05] tracking-[-0.03em] text-[#424965]">
            {price}
          </span>
          <span className="text-[13px] font-[500] text-[rgba(74,73,101,0.55)]">/mo</span>
        </div>
        {billedNote && (
          <p className="text-[11px] font-[400] leading-[1.45] text-[rgba(74,73,101,0.55)] mt-[4px]">
            {billedNote}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/25" />

      {/* Features */}
      <div className="space-y-[4px]">
        {features.map((f, i) => (
          <FeatureRow key={i} {...f} />
        ))}
      </div>

      {/* CTA */}
      {isGold ? (
        // GoldButton — Gold tier ONLY
        <button
          type="button"
          onClick={onCta}
          className="w-full h-[48px] rounded-[14px] text-[14px] font-[600] text-[#2A2400] active:scale-[0.96] transition-all duration-150"
          style={{
            background: "linear-gradient(145deg, #D9B528 0%, #BF9B18 100%)",
            boxShadow: "6px 6px 14px rgba(207,171,33,0.32), -4px -4px 10px rgba(255,220,70,0.50), inset 0 1px 0 rgba(255,255,255,0.22)",
          }}
        >
          {ctaLabel ?? "Upgrade to Gold"}
        </button>
      ) : (
        // PrimaryButton — Plus
        <button
          type="button"
          onClick={onCta}
          className="w-full h-[48px] rounded-[14px] text-[14px] font-[600] text-white active:scale-[0.96] transition-all duration-150"
          style={{
            background: "linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%)",
            boxShadow: "6px 6px 14px rgba(33,69,207,0.30), -4px -4px 10px rgba(96,141,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          {ctaLabel ?? "Get Plus"}
        </button>
      )}

      {/* Note */}
      <p className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)] text-center mt-[12px]">
        Cancel anytime
      </p>
    </div>
  );
};

export default PricingCard;
