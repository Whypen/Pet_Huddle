/**
 * StarUpgradeSheet — stars upsell modal (center-screen)
 * tier="plus"  → Free → Huddle+     (blue  #5BA4F5)
 * tier="gold"  → Plus → Huddle Gold  (coral #FF6452)
 *
 * Layout: pure folder-tab card, centered on screen.
 * "Maybe later" lives inside the card below the CTA.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Radio, Star, TrendingUp, Users } from "lucide-react";
import { QuotaBillingCycle, quotaConfig } from "@/config/quotaConfig";
import { fetchLivePrices, FALLBACK_PRICES, getStripeLocaleHints, type LivePriceMap } from "@/lib/stripePrices";
import { PriceDisplay } from "@/components/ui/PriceDisplay";

// ─── Types ────────────────────────────────────────────────────────────────────

type StarUpgradeTier = "plus" | "gold";

type StarUpgradeSheetProps = {
  isOpen: boolean;
  tier: StarUpgradeTier;
  billing: QuotaBillingCycle;
  loading?: boolean;
  onClose: () => void;
  onBillingChange: (billing: QuotaBillingCycle) => void;
  onUpgrade: () => void;
};

type FeatureItem = {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties; "aria-hidden"?: boolean }>;
  label: string;
};

// ─── Theme + static data ──────────────────────────────────────────────────────

const TIER_THEMES = {
  plus: { bg: "#5BA4F5", textOnBg: "#FFFFFF" },
  gold: { bg: "#FF6452", textOnBg: "#FFFFFF" },
} as const;

const CARD_FLOAT_STYLE: React.CSSProperties = {
  border: "1.5px solid rgba(255,255,255,0.88)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.10)",
};

const PLUS_HIGHLIGHTS: FeatureItem[] = [
  { icon: Star,  label: "4 Stars / month" },
  { icon: Users, label: "×2 Discovery" },
  { icon: Radio, label: "Broadcasts · 25km · 24h" },
];

const GOLD_HIGHLIGHTS: FeatureItem[] = [
  { icon: Star,        label: "10 Stars / month" },
  { icon: TrendingUp,  label: "3× Visibility priority" },
  { icon: Globe,       label: "Wide Open Discovery" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function StarUpgradeSheet({
  isOpen,
  tier,
  billing,
  loading = false,
  onClose,
  onBillingChange,
  onUpgrade,
}: StarUpgradeSheetProps) {
  const copy       = tier === "plus" ? quotaConfig.copy.stars.upgrade.free : quotaConfig.copy.stars.upgrade.plus;
  const theme      = TIER_THEMES[tier];
  const highlights = tier === "plus" ? PLUS_HIGHLIGHTS : GOLD_HIGHLIGHTS;

  const [livePrices, setLivePrices] = useState<LivePriceMap>(FALLBACK_PRICES);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetchLivePrices(getStripeLocaleHints()).then((p) => { if (active) setLivePrices(p); });
    return () => { active = false; };
  }, [isOpen]);

  const isAnnual    = billing === "annual";
  const monthlyAmt  = tier === "plus" ? livePrices.plus_monthly : livePrices.gold_monthly;
  const annualTotal = tier === "plus" ? livePrices.plus_annual  : livePrices.gold_annual;
  const annualPerMo = annualTotal / 12;
  const discountPct = Math.round((1 - annualPerMo / monthlyAmt) * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Overlay ── */}
          <motion.div
            key="star-upgrade-overlay"
            className="fixed inset-0 z-[5200] bg-[rgba(20,25,48,0.40)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={onClose}
          />

          {/* ── Centered modal ── */}
          <div className="fixed inset-0 z-[5201] flex items-center justify-center px-5 pointer-events-none">
            <motion.div
              key="star-upgrade-modal"
              className="w-full max-w-[390px] pointer-events-auto"
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 340, damping: 26, mass: 0.85 }}
              role="dialog"
              aria-modal="true"
            >
              {/* Pure folder-tab card */}
              <div className="overflow-hidden rounded-[20px]" style={CARD_FLOAT_STYLE}>

                {/* Tab row */}
                <div className="flex h-[44px]" style={{ background: theme.bg }}>
                  <button
                    type="button"
                    className="flex h-full flex-1 items-center justify-center text-[13px] font-[600]"
                    aria-pressed={!isAnnual}
                    onClick={() => onBillingChange("monthly")}
                    style={
                      !isAnnual
                        ? { color: theme.textOnBg }
                        : { background: "#FFFFFF", color: theme.bg, borderBottomRightRadius: "14px" }
                    }
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className="flex h-full flex-1 items-center justify-center gap-1.5 text-[13px] font-[600]"
                    aria-pressed={isAnnual}
                    onClick={() => onBillingChange("annual")}
                    style={
                      isAnnual
                        ? { color: theme.textOnBg }
                        : { background: "#FFFFFF", color: theme.bg, borderBottomLeftRadius: "14px" }
                    }
                  >
                    Annually
                    {!isAnnual && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-[500]"
                        style={{ background: theme.bg, color: theme.textOnBg }}
                      >
                        -{discountPct}%
                      </span>
                    )}
                  </button>
                </div>

                {/* Card body */}
                <div className="px-5 pb-5 pt-4" style={{ background: theme.bg }}>

                  {/* Headline + subheadline */}
                  <p className="text-[20px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                    {copy.headline}
                  </p>
                  <p className="mt-1 text-[12px] font-[400] leading-snug opacity-80" style={{ color: theme.textOnBg }}>
                    {copy.subheadline}
                  </p>

                  {/* Price */}
                  <div className="mt-4">
                    {!isAnnual ? (
                      <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                        <PriceDisplay n={monthlyAmt} currency={livePrices.currencyCode} />
                        <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                      </p>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-[400] line-through opacity-60" style={{ color: theme.textOnBg }}>
                            <PriceDisplay n={monthlyAmt} currency={livePrices.currencyCode} />
                          </span>
                          <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                            <PriceDisplay n={annualPerMo} currency={livePrices.currencyCode} />
                            <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                          </p>
                        </div>
                        <p className="mt-0.5 text-[12px] opacity-75" style={{ color: theme.textOnBg }}>
                          <PriceDisplay n={annualTotal} currency={livePrices.currencyCode} /> billed yearly
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="mt-4 h-px" style={{ background: "rgba(255,255,255,0.28)" }} />

                  {/* Feature highlights */}
                  <div className="mt-3">
                    {highlights.map((h) => (
                      <div key={h.label} className="flex items-center gap-3 py-2.5">
                        <h.icon size={18} strokeWidth={1.75} style={{ color: theme.textOnBg, opacity: 0.90 }} aria-hidden />
                        <p className="text-[13px] font-[600] leading-tight" style={{ color: theme.textOnBg }}>
                          {h.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={onUpgrade}
                    disabled={loading}
                    className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-[16px] text-[15px] font-[600] transition-opacity disabled:opacity-60"
                    style={{ background: "#FFFFFF", color: theme.bg }}
                  >
                    {loading ? "Loading…" : copy.cta}
                  </button>

                  {/* Maybe later — below CTA, inside card */}
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 w-full text-center text-[12px] font-[500] transition-opacity hover:opacity-100"
                    style={{ color: theme.textOnBg, opacity: 0.65 }}
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
