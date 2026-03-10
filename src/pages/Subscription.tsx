/**
 * Subscription — C.3 scrollable fallback route (/subscription → /premium)
 * Rendered when user navigates directly via Settings → "View plans"
 * NOT triggered from a locked-feature paywall context (that uses PaywallModal)
 *
 * Layout:
 *   Hero h1 + body → PlanToggle → PricingCards (Plus + Gold) → Feature section → FAQ → Footer
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, ChevronDown } from "lucide-react";
import { PricingCard } from "@/components/subscription/PricingCard";
import { PlanToggle } from "@/components/ui/v3/PlanToggle";
import { FeatureRow } from "@/components/subscription/FeatureRow";
import { fmtCurrency } from "@/lib/stripePrices";

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes — you can cancel your subscription at any time from Settings. Your access continues until the end of the billing period.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept all major credit cards, Apple Pay, and Google Pay.",
  },
  {
    q: "Is there a free trial?",
    a: "New subscribers get a 7-day free trial on Plus. Gold upgrades are billed immediately.",
  },
];

// ─── Feature table ────────────────────────────────────────────────────────────

const FEATURES = [
  { label: "Unlimited pet profiles",        icon: "check" as const, badge: null },
  { label: "Advanced Social discovery",     icon: "check" as const, badge: "plus" as const },
  { label: "Priority AI Vet responses",     icon: "check" as const, badge: "plus" as const },
  { label: "Emergency broadcasts",          icon: "check" as const, badge: "plus" as const },
  { label: "Gold verified badge",           icon: "lock" as const,  badge: "gold" as const },
  { label: "Exclusive Gold community",      icon: "lock" as const,  badge: "gold" as const },
  { label: "Priority nanny matching",       icon: "lock" as const,  badge: "gold" as const },
];

// ─── Component ────────────────────────────────────────────────────────────────

const Subscription: React.FC = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isAnnual = billing === "annual";

  return (
    <div className="min-h-svh">
      {/* Back header */}
      <header className="glass-bar fixed top-0 inset-x-0 z-[20] h-[56px] flex items-center px-[16px] gap-[12px]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
          aria-label="Back"
        >
          <ArrowLeft size={24} strokeWidth={1.5} />
        </button>
        <h1 className="text-[22px] font-[600] leading-[1.15] tracking-[-0.02em] text-[#424965]">
          Plans
        </h1>
      </header>

      {/* Scrollable content */}
      <div
        className="px-[20px] pb-[40px]"
        style={{
          paddingTop: "calc(56px + 24px + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <h1 className="text-[22px] font-[600] leading-[1.15] tracking-[-0.02em] text-[#424965] max-w-[22ch]">
          Upgrade Huddle
        </h1>
        <p className="text-[15px] font-[400] leading-[1.55] text-[#4a4a4a] mt-[8px] max-w-[36ch]">
          More safety. More connection.
        </p>

        {/* ── PlanToggle ─────────────────────────────────────────────────────── */}
        <div className="mt-[32px] flex justify-center">
          <PlanToggle
            value={billing}
            onChange={setBilling}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "annual",  label: "Annual", saveBadge: "-17%" },
            ]}
          />
        </div>

        {/* ── Pricing cards ─────────────────────────────────────────────────── */}
        <div className="mt-[32px] flex flex-col gap-[16px] items-center">
          <PricingCard
            tier="plus"
            price={isAnnual ? fmtCurrency(3.99) : fmtCurrency(4.99)}
            billedNote={isAnnual ? `Billed annually (${fmtCurrency(47.88)}/yr)` : "Billed monthly"}
            features={[
              { label: "Unlimited pet profiles", icon: "check" },
              { label: "Advanced Social discovery", icon: "check", badge: "plus" },
              { label: "Priority AI Vet", icon: "check", badge: "plus" },
              { label: "Emergency broadcasts", icon: "check", badge: "plus" },
            ]}
            ctaLabel="Start Free Trial"
            onCta={() => {}}
            recommended
          />
          <PricingCard
            tier="gold"
            price={isAnnual ? fmtCurrency(7.99) : fmtCurrency(9.99)}
            billedNote={isAnnual ? `Billed annually (${fmtCurrency(95.88)}/yr)` : "Billed monthly"}
            features={[
              { label: "Everything in Plus", icon: "check" },
              { label: "Gold verified badge", icon: "lock", badge: "gold" },
              { label: "Priority nanny matching", icon: "lock", badge: "gold" },
              { label: "Exclusive Gold community", icon: "lock", badge: "gold" },
            ]}
            ctaLabel="Upgrade to Gold"
            onCta={() => {}}
          />
        </div>

        {/* ── Feature comparison ────────────────────────────────────────────── */}
        <div className="glass-card mt-[40px] overflow-hidden" style={{ padding: 0 }}>
          {FEATURES.map((f, i) => (
            <div key={f.label} className={i > 0 ? "border-t border-white/15" : ""}>
              <FeatureRow {...f} className="px-[16px]" />
            </div>
          ))}
        </div>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <div className="glass-card mt-[40px] overflow-hidden" style={{ padding: 0 }}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={item.q} className={i > 0 ? "border-t border-white/15" : ""}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center gap-[12px] px-[16px] py-[14px] text-left"
                aria-expanded={openFaq === i}
              >
                <HelpCircle size={16} strokeWidth={1.5} className="text-[rgba(74,73,101,0.55)] flex-shrink-0" aria-hidden />
                <span className="flex-1 text-[13px] font-[500] text-[#424965]">{item.q}</span>
                <ChevronDown
                  size={16}
                  strokeWidth={1.5}
                  className="text-[rgba(74,73,101,0.55)] transition-transform duration-[200ms]"
                  style={{ transform: openFaq === i ? "rotate(180deg)" : "rotate(0deg)" }}
                  aria-hidden
                />
              </button>
              {openFaq === i && (
                <p className="px-[16px] pb-[14px] text-[13px] font-[400] leading-[1.55] text-[rgba(74,73,101,0.70)] max-w-[36ch]">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <p className="text-[11px] font-[400] text-[rgba(74,73,101,0.55)] text-center mt-[48px]">
          Cancel anytime · Secure payment
        </p>
      </div>
    </div>
  );
};

export default Subscription;
