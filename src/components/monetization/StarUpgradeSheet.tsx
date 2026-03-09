/**
 * StarUpgradeSheet — stars upsell bottom sheet
 * Fires when a user tries to send a star with no quota remaining.
 *
 * tier="plus"  → Free → Huddle+    (blue  #5BA4F5)
 * tier="gold"  → Plus → Huddle Gold (coral #FF6452)
 *
 * Prices fetched live from Stripe (cached at module level after first call).
 * Headline + subheadline sit inside the folder-tab card above the price.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Radio, Star, TrendingUp, Users } from "lucide-react";
import { QuotaBillingCycle, quotaConfig } from "@/config/quotaConfig";
import { fetchLivePrices, FALLBACK_PRICES, type LivePriceMap } from "@/lib/stripePrices";

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

  // Initialise with correct fallback prices (shown instantly); quietly
  // updated from Stripe after first fetch (result cached for session).
  const [livePrices, setLivePrices] = useState<LivePriceMap>(FALLBACK_PRICES);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetchLivePrices().then((p) => { if (active) setLivePrices(p); });
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
            <div className="overflow-hidden rounded-t-[28px] bg-[#F4F7FF] shadow-[0_-18px_48px_rgba(0,0,0,0.24)]">

              {/* "Maybe later" pill — top right */}
              <div className="flex justify-end px-4 pt-4 pb-2">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss"
                  className="inline-flex h-[30px] items-center justify-center rounded-full px-3.5 text-[12px] font-[500] text-[#5A6580]"
                  style={{
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(180,190,210,0.45)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  Maybe later
                </button>
              </div>

              {/* ── Folder-tab card ── */}
              <div
                className="mx-5 mb-[calc(1.25rem+var(--nav-height,64px)+env(safe-area-inset-bottom))] overflow-hidden rounded-[20px]"
                style={CARD_FLOAT_STYLE}
              >
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

                  {/* Headline + subheadline — inside card above price */}
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
                        {fmtCurrency(monthlyAmt)}
                        <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                      </p>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-[400] line-through opacity-60" style={{ color: theme.textOnBg }}>
                            {fmtCurrency(monthlyAmt)}
                          </span>
                          <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                            {fmtCurrency(annualPerMo)}
                            <span className="ml-1 text-[14px] font-[400] opacity-80">/mo</span>
                          </p>
                        </div>
                        <p className="mt-0.5 text-[12px] opacity-75" style={{ color: theme.textOnBg }}>
                          {fmtCurrency(annualTotal)} billed yearly
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
                    disabled={loading}
                    className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-[16px] text-[15px] font-[600] transition-opacity disabled:opacity-60"
                    style={{ background: "#FFFFFF", color: theme.bg }}
                  >
                    {loading ? "Loading…" : copy.cta}
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
