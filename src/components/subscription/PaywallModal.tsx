/**
 * PaywallModal — B.6 / C.3
 * DOM order is a PIXEL CONTRACT — do not reorder:
 * 1 Close X → 2 Orb cluster → 3 Headline → 4 Benefit rows ×3 →
 * 5 Pager dots → 6 Plan tiles → 7 Black pill CTA → 8 Restore link
 *
 * GOLD RULE: Plus modal uses --blue system exclusively.
 *            Gold modal uses --gold system exclusively.
 *            Never mixed.
 */

import React, { useState, useEffect } from "react";
import { X, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaywallTier = "plus" | "gold";
export type BillingCycle = "monthly" | "annual";

export interface PaywallBenefit {
  label: string;
}

export interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  tier?: PaywallTier;
  headline?: string;
  benefits?: PaywallBenefit[];
  ctaLabel?: string;
  /** Called when user taps the CTA */
  onSubscribe?: (cycle: BillingCycle) => void;
  /** Called when user taps "Restore purchase" */
  onRestore?: () => void;
  monthlyPrice?: string;
  annualPrice?: string;
  annualBilledNote?: string;
  savePercent?: number;
}

// ─── Default content ──────────────────────────────────────────────────────────

const PLUS_DEFAULTS: Required<
  Pick<PaywallModalProps, "headline" | "benefits" | "ctaLabel" | "monthlyPrice" | "annualPrice" | "annualBilledNote" | "savePercent">
> = {
  headline: "Connect more, protect better.",
  benefits: [
    { label: "Unlimited pet profiles & health logs" },
    { label: "Advanced Social filters & discovery" },
    { label: "Priority AI Vet responses" },
  ],
  ctaLabel: "Start Free Trial",
  monthlyPrice: "$4.99",
  annualPrice: "$3.99",
  annualBilledNote: "Billed annually",
  savePercent: 20,
};

const GOLD_DEFAULTS: Required<
  Pick<PaywallModalProps, "headline" | "benefits" | "ctaLabel" | "monthlyPrice" | "annualPrice" | "annualBilledNote" | "savePercent">
> = {
  headline: "The complete pet care experience.",
  benefits: [
    { label: "Everything in Plus, plus priority matching" },
    { label: "Gold badge & verified nanny profile" },
    { label: "Exclusive Gold community events" },
  ],
  ctaLabel: "Upgrade to Gold",
  monthlyPrice: "$9.99",
  annualPrice: "$7.99",
  annualBilledNote: "Billed annually",
  savePercent: 20,
};

// ─── PaywallModal ─────────────────────────────────────────────────────────────

export const PaywallModal: React.FC<PaywallModalProps> = ({
  open,
  onClose,
  tier = "plus",
  headline,
  benefits,
  ctaLabel,
  onSubscribe,
  onRestore,
  monthlyPrice,
  annualPrice,
  annualBilledNote,
  savePercent,
}) => {
  const isGold = tier === "gold";
  const defaults = isGold ? GOLD_DEFAULTS : PLUS_DEFAULTS;

  const resolvedHeadline = headline ?? defaults.headline;
  const resolvedBenefits = benefits ?? defaults.benefits;
  const resolvedCtaLabel = ctaLabel ?? defaults.ctaLabel;
  const resolvedMonthlyPrice = monthlyPrice ?? defaults.monthlyPrice;
  const resolvedAnnualPrice = annualPrice ?? defaults.annualPrice;
  const resolvedAnnualBilledNote = annualBilledNote ?? defaults.annualBilledNote;
  const resolvedSavePercent = savePercent ?? defaults.savePercent;

  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>("annual");
  // Pager dots — 3 static for visual parity with reference
  const [activeDot] = useState(0);

  // Trap scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  // Tier-specific color values
  const ringColor = isGold ? "ring-[#CFAB21]/40" : "ring-[#2145CF]/40";

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[40] flex flex-col justify-end"
      style={{ background: "rgba(66,73,101,0.40)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${isGold ? "Gold" : "Plus"} upgrade`}
    >
      {/* Panel — glass-l2 */}
      <div
        className="glass-l2 !rounded-[32px_32px_0_0] overflow-y-auto"
        style={{
          maxHeight: "88dvh",
          padding: "0 20px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
          animation: "v3-sheet-in 350ms cubic-bezier(0.34,1.20,0.64,1) forwards",
        }}
      >
        {/* ── NODE 1: Close X ──────────────────────────────────────────────── */}
        <div className="relative h-[52px] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-0 right-0 w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* ── NODE 2: Orb cluster ───────────────────────────────────────────── */}
        <div className="flex items-center justify-center mt-[24px]">
          <div className="relative w-[120px] h-[80px]">
            {/* Blue orb */}
            <span
              className="absolute left-[0px] top-[0px] w-[80px] h-[80px] rounded-full"
              style={{
                background: "#2145CF",
                opacity: 0.75,
                filter: "blur(24px)",
              }}
              aria-hidden
            />
            {/* Gold orb */}
            <span
              className="absolute left-[36px] top-[8px] w-[64px] h-[64px] rounded-full"
              style={{
                background: "#CFAB21",
                opacity: isGold ? 0.80 : 0.55,
                filter: "blur(24px)",
              }}
              aria-hidden
            />
            {/* Periwinkle orb */}
            <span
              className="absolute left-[60px] top-[16px] w-[56px] h-[56px] rounded-full"
              style={{
                background: "#9AACD8",
                opacity: 0.70,
                filter: "blur(24px)",
              }}
              aria-hidden
            />
          </div>
        </div>

        {/* ── NODE 3: Headline ─────────────────────────────────────────────── */}
        <h1
          className="text-[22px] font-[600] leading-[1.15] tracking-[-0.02em] text-[#424965] text-center mx-auto mt-[16px] max-w-[22ch]"
        >
          {resolvedHeadline}
        </h1>

        {/* ── NODE 4: Benefit rows ×3 ───────────────────────────────────────── */}
        <div className="space-y-[12px] mt-[24px]">
          {resolvedBenefits.slice(0, 3).map((b, i) => (
            <div key={i} className="flex items-center gap-[12px]">
              <Check
                size={16}
                strokeWidth={1.5}
                className="text-[#22C55E] flex-shrink-0"
                aria-hidden
              />
              <span className="text-[15px] font-[400] leading-[1.55] text-[#424965] max-w-[36ch]">
                {b.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── NODE 5: Pager dots ────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-[6px] mt-[20px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: i === activeDot ? "20px" : "6px",
                height: "6px",
                background: i === activeDot
                  ? (isGold ? "#CFAB21" : "#2145CF")
                  : "rgba(66,73,101,0.22)",
                transition: "width 200ms cubic-bezier(0.0,0.0,0.2,1)",
              }}
              aria-hidden
            />
          ))}
        </div>

        {/* ── NODE 6: Plan tiles (Monthly + Annual) ─────────────────────────── */}
        <div className="flex gap-[12px] mt-[24px]">
          {/* Monthly tile */}
          <button
            type="button"
            onClick={() => setSelectedCycle("monthly")}
            className={[
              "glass-card flex-1 p-[16px] text-left relative",
              selectedCycle === "monthly" ? `ring-2 ${ringColor}` : "",
            ].join(" ")}
            aria-pressed={selectedCycle === "monthly"}
          >
            <span className="text-[16px] font-[600] text-[#424965] block">Monthly</span>
            <div className="flex items-baseline gap-[2px] mt-[4px]">
              <span className="text-[22px] font-[700] text-[#424965]">{resolvedMonthlyPrice}</span>
              <span className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)]">/mo</span>
            </div>
            <span className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)] mt-[2px] block">
              Billed monthly
            </span>
          </button>

          {/* Annual tile — selected by default */}
          <button
            type="button"
            onClick={() => setSelectedCycle("annual")}
            className={[
              "glass-card flex-1 p-[16px] text-left relative",
              selectedCycle === "annual" ? `ring-2 ${ringColor}` : "",
            ].join(" ")}
            aria-pressed={selectedCycle === "annual"}
          >
            {/* Save badge — absolute -top-3 right-3 */}
            <span
              className="absolute -top-[12px] right-[12px] text-[10px] font-[500] text-white px-[8px] py-[2px] rounded-full"
              style={{ background: isGold ? "#CFAB21" : "#2145CF" }}
            >
              Save {resolvedSavePercent}%
            </span>
            <span className="text-[16px] font-[600] text-[#424965] block">Annual</span>
            <div className="flex items-baseline gap-[2px] mt-[4px]">
              <span className="text-[22px] font-[700] text-[#424965]">{resolvedAnnualPrice}</span>
              <span className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)]">/mo</span>
            </div>
            <span className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)] mt-[2px] block">
              {resolvedAnnualBilledNote}
            </span>
          </button>
        </div>

        {/* ── NODE 7: Black pill CTA ────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => onSubscribe?.(selectedCycle)}
          className="w-full h-[56px] rounded-[9999px] mt-[24px] text-[16px] font-[600] text-white active:scale-[0.98] transition-transform duration-150"
          style={{
            background: "#0D0D0D",
            boxShadow: "0 6px 20px rgba(0,0,0,0.32)",
          }}
        >
          {resolvedCtaLabel}
        </button>

        {/* ── NODE 8: Restore link ──────────────────────────────────────────── */}
        <div className="flex justify-center mt-[12px]">
          <button
            type="button"
            onClick={onRestore}
            className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)] py-[12px] min-h-[44px] hover:text-[#424965] transition-colors duration-150"
          >
            Restore purchase
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;
