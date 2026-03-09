/**
 * StarUpgradeSheet — stars upsell bottom sheet
 * Fires when a user tries to send a star with no quota remaining.
 *
 * tier="plus"  → Free user upgrading to Huddle+  (blue  #5BA4F5)
 * tier="gold"  → Plus user upgrading to Huddle Gold (coral #FF6452)
 *
 * Matches folder-tab card design from Premium.tsx (UI_CONTRACT v6.1 §6).
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Radio, Star, TrendingUp, Users, X } from "lucide-react";
import { QuotaBillingCycle, quotaConfig } from "@/config/quotaConfig";
import { supabase } from "@/integrations/supabase/client";

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

// Source-of-truth fallback — matches Stripe plan amounts
const FALLBACK_PRICES = {
  plus: {
    monthly: quotaConfig.stripePlans.plus.monthly.amount,
    annual:  quotaConfig.stripePlans.plus.annual.amount,
  },
  gold: {
    monthly: quotaConfig.stripePlans.gold.monthly.amount,
    annual:  quotaConfig.stripePlans.gold.annual.amount,
  },
};

const CARD_FLOAT_STYLE: React.CSSProperties = {
  border: "1.5px solid rgba(255,255,255,0.88)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  try {
    return new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

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

  const [livePrices, setLivePrices]     = useState(FALLBACK_PRICES[tier]);
  const [pricingLoading, setPricingLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setPricingLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("stripe-pricing");
      if (!active) return;
      if (!error && data?.prices) {
        const p = data.prices as Record<string, { amount?: number }>;
        const key = tier === "plus"
          ? { m: "plus_monthly", a: "plus_annual" }
          : { m: "gold_monthly", a: "gold_annual" };
        setLivePrices({
          monthly: typeof p[key.m]?.amount === "number" ? p[key.m]!.amount! : FALLBACK_PRICES[tier].monthly,
          annual:  typeof p[key.a]?.amount === "number" ? p[key.a]!.amount! : FALLBACK_PRICES[tier].annual,
        });
      }
      if (active) setPricingLoading(false);
    })();
    return () => { active = false; };
  }, [isOpen, tier]);

  const isAnnual   = billing === "annual";
  const monthlyAmt = livePrices.monthly;
  const annualTotal  = livePrices.annual;
  const annualPerMo  = annualTotal / 12;
  const discountPct  = Math.round((1 - annualPerMo / monthlyAmt) * 100);
  const canUpgrade   = !loading && !pricingLoading;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Overlay ── */}
          <motion.div
            key="star-upgrade-overlay"
            className="fixed inset-0 z-[5200] bg-[rgba(20,25,48,0.32)] backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={onClose}
          />

          {/* ── Sheet ── */}
          <motion.div
            key="star-upgrade-sheet"
            className="fixed inset-x-0 bottom-0 z-[5201] mx-auto w-full max-w-[var(--app-max-width,430px)]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.9 }}
            role="dialog"
            aria-modal="true"
          >
            <div className="relative overflow-hidden rounded-t-[28px] bg-[#F4F7FF] shadow-[0_-18px_48px_rgba(0,0,0,0.24)]">

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close upgrade"
                className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.70)] text-[#424965]"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header copy */}
              <div className="px-6 pb-4 pt-6">
                <p className="text-[22px] font-extrabold leading-tight text-[#2F3B78]">
                  {copy.headline}
                </p>
                <p className="mt-1 text-[13px] text-[#4C598E]">
                  {copy.subheadline}
                </p>
              </div>

              {/* ── Folder-tab card ── */}
              <div
                className="mx-5 mb-[calc(1.25rem+var(--nav-height,64px)+env(safe-area-inset-bottom))] overflow-hidden rounded-[20px]"
                style={CARD_FLOAT_STYLE}
              >

                {/* Tab row */}
                <div className="flex h-[44px]" style={{ background: theme.bg }}>

                  {/* Monthly tab */}
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

                  {/* Annual tab */}
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

                  {/* Price display */}
                  {!isAnnual ? (
                    <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                      {pricingLoading ? "—" : fmtCurrency(monthlyAmt)}
                      <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                    </p>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-[15px] font-[400] line-through opacity-60"
                          style={{ color: theme.textOnBg }}
                        >
                          {pricingLoading ? "—" : fmtCurrency(monthlyAmt)}
                        </span>
                        <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                          {pricingLoading ? "—" : fmtCurrency(annualPerMo)}
                          <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                        </p>
                      </div>
                      <p className="mt-0.5 text-[12px] opacity-75" style={{ color: theme.textOnBg }}>
                        {pricingLoading ? "Loading prices…" : `${fmtCurrency(annualTotal)} billed yearly`}
                      </p>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="mt-4 h-px" style={{ background: "rgba(255,255,255,0.28)" }} />

                  {/* Feature highlights */}
                  <div className="mt-3">
                    {highlights.map((h) => (
                      <div key={h.label} className="flex items-center gap-3 py-2.5">
                        <h.icon
                          size={18}
                          strokeWidth={1.75}
                          style={{ color: theme.textOnBg, opacity: 0.90 }}
                          aria-hidden
                        />
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
                    disabled={!canUpgrade}
                    className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-[16px] text-[15px] font-[600] transition-opacity disabled:opacity-60"
                    style={{ background: "#FFFFFF", color: theme.bg }}
                  >
                    {loading ? "Loading…" : pricingLoading ? "Loading prices…" : copy.cta}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
