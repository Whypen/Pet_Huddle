/**
 * Premium.tsx — Subscription redesign
 * Design: 2026-03-09-subscription-notifications-redesign-design.md
 * UI_CONTRACT v6.1 § Section 6 · MASTER_SPEC §2.5 / §2.6 / §2.11
 */

import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  Heart,
  Megaphone,
  Radio,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Users,
  Users2,
  Video,
  Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { toast } from "sonner";
import { quotaConfig } from "@/config/quotaConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanTab = "plus" | "gold" | "addons";
type Billing = "monthly" | "annual";

type FeatureRow = {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
  label: string;
  sublabel: string;
};

type AddOnItem = {
  id: "superBroadcast" | "discoveryBoost" | "sharePerks";
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  subtitle: string;
  price: number;
  priceLabel: string;
};

// ─── Static data ──────────────────────────────────────────────────────────────

// Prices per MASTER_SPEC §2.5
const PRICES = {
  plus: { monthly: 5.99, annual: 4.99, annualBilled: 59.99 },
  gold: { monthly: 11.99, annual: 9.16, annualBilled: 109.99 },
} as const;

// Per-plan color tokens — tab active, annual toggle active, CTA, feature icon
const PLAN_COLORS = {
  plus: {
    tabActive: { background: "#7CFF6B", color: "#194219" },
    annualActive: { background: "#2145CF", color: "#FFFFFF" },
    annualCardBg: "rgba(33,69,207,0.06)",
    ctaBackground: "#7CFF6B",
    ctaColor: "#194219",
    featureIcon: "#2145CF",
  },
  gold: {
    tabActive: { background: "#CFAB21", color: "#FFFFFF" },
    annualActive: { background: "#CFAB21", color: "#FFFFFF" },
    annualCardBg: "rgba(207,171,33,0.10)",
    ctaBackground: "#CFAB21",
    ctaColor: "#FFFFFF",
    featureIcon: "#CFAB21",
  },
  addons: {
    tabActive: { background: "#7CFF6B", color: "#194219" },
  },
} as const;

const PLUS_FEATURES: FeatureRow[] = [
  { icon: Users,             label: "×2 Discovery",     sublabel: "More connections, less noise" },
  { icon: Star,              label: "4 Stars / month",  sublabel: "Trigger conversations directly" },
  { icon: Radio,             label: "Broadcasts · 25km · 24h", sublabel: "Alert your neighbourhood" },
  { icon: SlidersHorizontal, label: "Advanced Filters", sublabel: "Find your kind of people" },
  { icon: Heart,             label: "Link Family",      sublabel: "Connect all your pet accounts" },
];

const GOLD_FEATURES: FeatureRow[] = [
  { icon: Globe,             label: "Wide Open Discovery",     sublabel: "Keep discovering" },
  { icon: TrendingUp,        label: "3× Visibility priority",  sublabel: "Become a top profile" },
  { icon: Star,              label: "10 Stars / month",        sublabel: "The most direct connections" },
  { icon: Radio,             label: "Broadcasts · 50km · 48h", sublabel: "Maximum reach" },
  { icon: SlidersHorizontal, label: "All Filters Access",      sublabel: "Including Active Now + Same Energy" },
  { icon: Video,             label: "Video upload",            sublabel: "Gold-exclusive" },
  { icon: Users2,            label: "Link Family",             sublabel: "Connect all your pet accounts" },
];

const ADD_ONS: AddOnItem[] = [
  {
    id: "superBroadcast",
    icon: Megaphone,
    title: "Super Broadcast",
    subtitle: "72h · 150km · slot bypass",
    price: 4.99,
    priceLabel: "$4.99",
  },
  {
    id: "discoveryBoost",
    icon: Zap,
    title: "Discovery Boost",
    subtitle: "3× ranking weight · 24h",
    price: 2.99,
    priceLabel: "$2.99",
  },
  {
    id: "sharePerks",
    icon: Users2,
    title: "Share Perks",
    subtitle: "Mirror tier to 2 members",
    price: 4.99,
    priceLabel: "$4.99/mo",
  },
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

function discountPct(tier: "plus" | "gold"): number {
  const p = PRICES[tier];
  return Math.round((1 - p.annual / p.monthly) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PremiumPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();

  // Default tab: gold (Recommended)
  const [activeTab, setActiveTab] = useState<PlanTab>("gold");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [addonSelected, setAddonSelected] = useState<Record<AddOnItem["id"], boolean>>({
    superBroadcast: false,
    discoveryBoost: false,
    sharePerks: false,
  });
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // ── Sequential checkout: detect ?plan_done=1 ────────────────────────────────
  useEffect(() => {
    const planDone = searchParams.get("plan_done");
    if (planDone !== "1") return;

    const raw = sessionStorage.getItem("pending_addons");
    if (!raw) {
      setSearchParams({}, { replace: true });
      return;
    }

    let pending: { id: string; qty: number }[] = [];
    try {
      pending = JSON.parse(raw) as { id: string; qty: number }[];
    } catch {
      sessionStorage.removeItem("pending_addons");
      setSearchParams({}, { replace: true });
      return;
    }

    sessionStorage.removeItem("pending_addons");
    setSearchParams({}, { replace: true });

    if (!pending.length || !user) return;

    (async () => {
      try {
        setIsCheckingOut(true);
        const total = pending.reduce((sum, item) => {
          const a = ADD_ONS.find((x) => x.id === item.id);
          return sum + (a?.price ?? 0) * item.qty;
        }, 0);

        const { data, error } = await supabase.functions.invoke("create-checkout-session", {
          body: {
            userId: user.id,
            mode: "payment",
            items: pending.map((p) => ({ type: p.id, quantity: p.qty })),
            amount: Math.round(total * 100),
            successUrl: `${window.location.origin}/premium?addon_done=1`,
            cancelUrl: `${window.location.origin}/premium`,
          },
        });
        if (error) throw error;
        const url = (data as { url?: string } | null)?.url;
        if (url) window.location.assign(url);
      } catch {
        toast.error(t("Checkout unavailable. Please try again."));
      } finally {
        setIsCheckingOut(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect addon_done ────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get("addon_done") === "1") {
      setSearchParams({}, { replace: true });
      toast.success(t("Add-ons added to your account ✓"));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Checkout handlers ────────────────────────────────────────────────────────
  const selectedAddonItems = useMemo(
    () => ADD_ONS.filter((a) => addonSelected[a.id]),
    [addonSelected]
  );

  const addonTotal = useMemo(
    () => selectedAddonItems.reduce((sum, a) => sum + a.price, 0),
    [selectedAddonItems]
  );

  const startPlanCheckout = async (tier: "plus" | "gold") => {
    if (!user) { navigate("/auth"); return; }
    if (isCheckingOut) return;

    try {
      setIsCheckingOut(true);
      const plan = quotaConfig.stripePlans[tier][billing];
      const type = `${tier}_${billing}`;

      const hasAddons = selectedAddonItems.length > 0;
      const successUrl = hasAddons
        ? `${window.location.origin}/premium?plan_done=1`
        : `${window.location.origin}/premium`;

      if (hasAddons) {
        sessionStorage.setItem(
          "pending_addons",
          JSON.stringify(selectedAddonItems.map((a) => ({ id: a.id, qty: 1 })))
        );
      }

      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          mode: "subscription",
          type,
          lookupKey: plan.lookupKey,
          priceId: plan.priceId,
          successUrl,
          cancelUrl: `${window.location.origin}/premium`,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (url) {
        console.log("[Premium] Checkout URL:", url);
        window.location.assign(url);
      }
    } catch {
      sessionStorage.removeItem("pending_addons");
      toast.error(t("Checkout unavailable. Please try again."));
    } finally {
      setIsCheckingOut(false);
    }
  };

  const startAddonOnlyCheckout = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!selectedAddonItems.length || isCheckingOut) return;

    try {
      setIsCheckingOut(true);
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          mode: "payment",
          items: selectedAddonItems.map((a) => ({ type: a.id, quantity: 1 })),
          amount: Math.round(addonTotal * 100),
          successUrl: `${window.location.origin}/premium?addon_done=1`,
          cancelUrl: `${window.location.origin}/premium`,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (url) window.location.assign(url);
    } catch {
      toast.error(t("Checkout unavailable. Please try again."));
    } finally {
      setIsCheckingOut(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderBillingToggle = (tier: "plus" | "gold") => {
    const prices = PRICES[tier];
    const colors = PLAN_COLORS[tier];
    const pct = discountPct(tier);
    const isAnnual = billing === "annual";

    return (
      <div className="mt-4">
        {/* Toggle pill */}
        <div className="relative inline-flex">
          {/* Discount % badge — floats above Annual button */}
          <span
            className="absolute -top-5 right-0 px-2 py-0.5 rounded-full text-[10px] font-[500]"
            style={{ background: "#E0F2B6", color: "#2145CF" }}
          >
            -{pct}%
          </span>

          <div className="inline-flex rounded-full p-[3px] gap-1"
            style={{
              background: "rgba(255,255,255,0.18)",
              boxShadow: "inset 2px 2px 6px rgba(163,168,190,0.20)",
            }}
          >
            <button
              onClick={() => setBilling("monthly")}
              aria-pressed={!isAnnual}
              className="h-[30px] px-4 rounded-full text-[13px] font-[500] transition-all duration-150"
              style={
                !isAnnual
                  ? { background: "rgba(255,255,255,0.90)", color: "var(--text-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }
                  : { background: "transparent", color: "var(--text-secondary)" }
              }
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              aria-pressed={isAnnual}
              className="h-[30px] px-4 rounded-full text-[13px] font-[500] transition-all duration-150"
              style={
                isAnnual
                  ? { background: colors.annualActive.background, color: colors.annualActive.color }
                  : { background: "transparent", color: "var(--text-secondary)" }
              }
            >
              Annual
            </button>
          </div>
        </div>

        {/* Price display */}
        <div
          className="mt-3 rounded-[14px] px-3 py-3 transition-colors duration-200"
          style={{ background: isAnnual ? colors.annualCardBg : "transparent" }}
        >
          {!isAnnual ? (
            <p className="text-[28px] font-[700] text-[var(--text-primary)] leading-tight">
              {fmtCurrency(prices.monthly)}
              <span className="text-[14px] font-[400] text-[var(--text-secondary)] ml-1">/mo</span>
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-[400] line-through text-[var(--text-tertiary)]">
                  {fmtCurrency(prices.monthly)}
                </span>
                <p className="text-[28px] font-[700] text-[var(--text-primary)] leading-tight">
                  {fmtCurrency(prices.annual)}
                  <span className="text-[14px] font-[400] text-[var(--text-secondary)] ml-1">/mo</span>
                </p>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                {fmtCurrency(prices.annualBilled)} billed yearly
              </p>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderFeatureRows = (features: FeatureRow[], iconColor: string) => (
    <div className="mt-5 space-y-0">
      {features.map((f) => (
        <div key={f.label} className="flex items-start gap-3 py-2.5">
          <f.icon
            size={20}
            strokeWidth={1.75}
            className="flex-shrink-0 mt-0.5"
            style={{ color: iconColor }}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-[600] text-[var(--text-primary)] leading-tight">
              {f.label}
            </p>
            <p className="text-[12px] font-[400] text-[var(--text-secondary)] mt-0.5">
              {f.sublabel}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  // ── Tab content ──────────────────────────────────────────────────────────────

  const renderPlusTab = () => (
    <div className="px-5">
      {renderBillingToggle("plus")}
      {renderFeatureRows(PLUS_FEATURES, PLAN_COLORS.plus.featureIcon)}

      {/* Plus CTA — Lime Green */}
      <div className="mt-6">
        <button
          className="w-full h-[52px] rounded-[20px] text-[15px] font-[600] flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: PLAN_COLORS.plus.ctaBackground,
            color: PLAN_COLORS.plus.ctaColor,
            opacity: isCheckingOut ? 0.6 : 1,
          }}
          disabled={isCheckingOut}
          onClick={() => void startPlanCheckout("plus")}
        >
          <ShoppingCart size={18} strokeWidth={1.75} aria-hidden />
          {isCheckingOut ? "Loading…" : "Get Huddle+"}
        </button>
      </div>
    </div>
  );

  const renderGoldTab = () => (
    <div className="px-5">
      {renderBillingToggle("gold")}
      {renderFeatureRows(GOLD_FEATURES, PLAN_COLORS.gold.featureIcon)}

      {/* Gold CTA — Brand Gold */}
      <div className="mt-6">
        <button
          className="w-full h-[52px] rounded-[20px] text-[15px] font-[600] flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: "linear-gradient(135deg, #CFAB21 0%, #E0C435 100%)",
            color: "#FFFFFF",
            opacity: isCheckingOut ? 0.6 : 1,
          }}
          disabled={isCheckingOut}
          onClick={() => void startPlanCheckout("gold")}
        >
          <ShoppingCart size={18} strokeWidth={1.75} aria-hidden />
          {isCheckingOut ? "Loading…" : "Get Gold"}
        </button>
      </div>
    </div>
  );

  const renderAddonsTab = () => (
    <div className="px-5">
      {/* Header copy */}
      <div className="mt-6 mb-4">
        <p
          className="text-[11px] font-[500] uppercase tracking-[0.06em]"
          style={{ color: "#2145CF" }}
        >
          Separate purchase
        </p>
        <p className="text-[13px] font-[400] text-[var(--text-secondary)] mt-1">
          Add power-ups to any plan, billed once.
        </p>
      </div>

      {/* Add-on rows */}
      <div className="rounded-[20px] overflow-hidden glass-e1">
        {ADD_ONS.map((addon, i) => {
          const selected = addonSelected[addon.id];
          return (
            <div key={addon.id}>
              {i > 0 && <div className="h-px bg-white/20 mx-4" />}
              <div className="flex items-center gap-3 px-4 py-4">
                <addon.icon
                  size={20}
                  strokeWidth={1.75}
                  className="text-[var(--text-secondary)] flex-shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[600] text-[var(--text-primary)] leading-tight">
                    {addon.title}
                  </p>
                  <p className="text-[12px] font-[400] text-[var(--text-secondary)] mt-0.5">
                    {addon.subtitle}
                  </p>
                  <p className="text-[13px] font-[600] text-[var(--text-primary)] mt-1">
                    {addon.priceLabel}
                  </p>
                </div>
                <NeuControl
                  size="sm"
                  variant={selected ? "primary" : "tertiary"}
                  selected={selected}
                  onClick={() =>
                    setAddonSelected((prev) => ({ ...prev, [addon.id]: !prev[addon.id] }))
                  }
                  aria-label={`${selected ? "Remove" : "Add"} ${addon.title}`}
                >
                  {selected ? "Remove" : "Add"}
                </NeuControl>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add-ons CTA */}
      <div className="mt-4">
        <button
          className="w-full h-[52px] rounded-[20px] text-[15px] font-[600] flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: "#2145CF",
            color: "#FFFFFF",
            opacity: !selectedAddonItems.length || isCheckingOut ? 0.38 : 1,
            pointerEvents: !selectedAddonItems.length || isCheckingOut ? "none" : "auto",
          }}
          disabled={!selectedAddonItems.length || isCheckingOut}
          onClick={() => void startAddonOnlyCheckout()}
        >
          <ShoppingBag size={18} strokeWidth={1.75} aria-hidden />
          {selectedAddonItems.length > 0
            ? `Purchase Add-ons · ${fmtCurrency(addonTotal)}`
            : "Purchase Add-ons"}
        </button>
      </div>

      {/* Footer note */}
      <p className="text-[11px] font-[400] text-[var(--text-tertiary)] text-center mt-4">
        Add-ons are purchased separately from your subscription.
      </p>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-svh overflow-x-hidden">
      {/* GlobalHeader with X close button */}
      <GlobalHeader closeButton={() => navigate(-1)} />

      {/* Scrollable body */}
      <div
        className="overflow-y-auto"
        style={{ paddingBottom: "calc(90px + env(safe-area-inset-bottom))" }}
      >
        {/* Hero block */}
        <div className="px-5 pt-5">
          <h1
            className="font-[700] text-[var(--text-primary)] leading-tight"
            style={{ fontSize: "28px", maxWidth: "22ch" }}
          >
            Every Pet Deserves More.
          </h1>
          <p
            className="font-[400] text-[var(--text-secondary)] mt-2 whitespace-nowrap"
            style={{ fontSize: "12px" }}
          >
            Connect wider. Care deeper. Make pet lives better.
          </p>
        </div>

        {/* Plan segmented control */}
        <div className="px-5 mt-7 relative">
          {/* "Recommended" badge — floats above Gold option */}
          <div
            className="absolute top-0 pointer-events-none"
            style={{ left: "calc(5px + 33.33% + 8px)", transform: "translateY(-120%)" }}
            aria-hidden
          >
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-[500]"
              style={{ background: "#E0F2B6", color: "#2145CF" }}
            >
              Recommended
            </span>
          </div>

          {/* Segmented buttons — pure elements to avoid CSS transition blink */}
          <div className="flex gap-2 mt-5">
            {(["plus", "gold", "addons"] as PlanTab[]).map((tab) => {
              const isActive = activeTab === tab;
              const colors = PLAN_COLORS[tab].tabActive;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  aria-pressed={isActive}
                  className="flex-1 h-[36px] rounded-[18px] text-[13px] font-[600]"
                  style={
                    isActive
                      ? {
                          background: colors.background,
                          color: colors.color,
                        }
                      : {
                          background: "rgba(255,255,255,0.18)",
                          color: "var(--text-secondary)",
                          boxShadow: "inset 2px 2px 6px rgba(163,168,190,0.20)",
                        }
                  }
                >
                  {tab === "plus" ? "Huddle+" : tab === "gold" ? "Gold" : "Add-ons"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-2">
          {activeTab === "plus" && renderPlusTab()}
          {activeTab === "gold" && renderGoldTab()}
          {activeTab === "addons" && renderAddonsTab()}
        </div>
      </div>
    </div>
  );
}
