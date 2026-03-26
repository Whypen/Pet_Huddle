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
  Minus,
  Plus,
  Radio,
  ShoppingBag,
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
import { toast } from "sonner";
import { normalizeQuotaTier, quotaConfig } from "@/config/quotaConfig";
import { fetchLivePrices, FALLBACK_PRICES, getStripeLocaleHints, type LivePriceMap } from "@/lib/stripePrices";
import { PriceDisplay } from "@/components/ui/PriceDisplay";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanTab = "plus" | "gold" | "addons";
type Billing = "monthly" | "annual";

type FeatureRow = {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
  label: string;
  sublabel: string;
};

type AddOnItem = {
  id: "superBroadcast" | "topProfileBooster" | "sharePerks";
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
  title: string;
  subtitle: string;
  price: number;
  billingNote?: string; // e.g. "/mo" for recurring add-ons
};

// ─── Static data ──────────────────────────────────────────────────────────────

// Folder card bg + text on that bg (white for blue/coral, dark-green for lime)
const PLAN_THEMES = {
  plus:   { bg: "#5BA4F5", textOnBg: "#FFFFFF" },
  gold:   { bg: "#FF6452", textOnBg: "#FFFFFF" },
  addons: { bg: "#7CFF6B", textOnBg: "#194219" },
} as const;

const BRAND_BLUE = "#2145CF";

// Folder card floating style — white border + soft shadow
const CARD_FLOAT_STYLE: React.CSSProperties = {
  border: "1.5px solid rgba(255,255,255,0.88)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
};

const PLUS_FEATURES: FeatureRow[] = [
  { icon: Users,             label: "×2 Discovery",            sublabel: "More connections, less noise" },
  { icon: Star,              label: "4 Stars / month",          sublabel: "Trigger conversations directly" },
  { icon: Radio,             label: "Broadcasts · 25km · 24h", sublabel: "Alert your neighbourhood" },
  { icon: SlidersHorizontal, label: "Advanced Filters",         sublabel: "Find your kind of people" },
  { icon: Heart,             label: "Link Family",              sublabel: "Connect all your pet accounts" },
];

const GOLD_FEATURES: FeatureRow[] = [
  { icon: Globe,             label: "Wide Open Discovery",      sublabel: "Keep discovering" },
  { icon: TrendingUp,        label: "3× Visibility priority",   sublabel: "Become a top profile" },
  { icon: Star,              label: "10 Stars / month",         sublabel: "The most direct connections" },
  { icon: Radio,             label: "Broadcasts · 50km · 48h",  sublabel: "Maximum reach" },
  { icon: SlidersHorizontal, label: "All Filters Access",       sublabel: "Including Active Now + Same Energy" },
  { icon: Video,             label: "Video upload",             sublabel: "Gold-exclusive" },
  { icon: Users2,            label: "Link Family",              sublabel: "Connect all your pet accounts" },
];

const ADD_ONS: AddOnItem[] = [
  {
    id: "superBroadcast",
    icon: Megaphone,
    title: "Super Broadcast",
    subtitle: "Highlighted for 72h · range 150km",
    price: 4.99,
  },
  {
    id: "topProfileBooster",
    icon: Zap,
    title: "Top Profile Booster",
    subtitle: "3x Prioritized Profile Visibility · 24h",
    price: 2.99,
  },
  {
    id: "sharePerks",
    icon: Users2,
    title: "Share Perks",
    subtitle: "Mirrors tier's access to exclusive features",
    price: 4.99,
    billingNote: "/mo",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function discountPct(monthlyAmt: number, annualTotal: number): number {
  return Math.round((1 - annualTotal / 12 / monthlyAmt) * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PremiumPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<PlanTab>("gold");
  const [plusBilling, setPlusBilling] = useState<Billing>("monthly");
  const [goldBilling, setGoldBilling] = useState<Billing>("monthly");
  const [addonSelected, setAddonSelected] = useState<Record<AddOnItem["id"], boolean>>({
    superBroadcast: false,
    topProfileBooster: false,
    sharePerks: false,
  });
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const normalizedTier = normalizeQuotaTier(profile?.effective_tier ?? profile?.tier ?? "free");

  // ── Live Stripe prices — cached at module level after first fetch ────────────
  const [livePrices, setLivePrices] = useState<LivePriceMap>(FALLBACK_PRICES);

  useEffect(() => {
    let active = true;
    fetchLivePrices(getStripeLocaleHints()).then((prices) => { if (active) setLivePrices(prices); });
    return () => { active = false; };
  }, []);

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
            ...getStripeLocaleHints(),
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

  useEffect(() => {
    if (searchParams.get("addon_done") === "1") {
      setSearchParams({}, { replace: true });
      toast.success(t("Add-ons added to your account ✓"));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Checkout handlers ─────────────────────────────────────────────────────────

  const selectedAddonItems = useMemo(
    () => ADD_ONS.filter((a) => addonSelected[a.id]),
    [addonSelected]
  );

  const addonTotal = useMemo(
    () => selectedAddonItems.reduce(
      (sum, a) => sum + (livePrices[a.id as keyof LivePriceMap] ?? a.price),
      0
    ),
    [selectedAddonItems, livePrices]
  );

  const startPlanCheckout = async (tier: "plus" | "gold") => {
    if (!user) { navigate("/auth"); return; }
    if (isCheckingOut) return;
    if (normalizedTier === "gold") return;
    if (normalizedTier === "plus" && tier === "plus") return;

    const billing = tier === "plus" ? plusBilling : goldBilling;

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
          ...getStripeLocaleHints(),
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
          ...getStripeLocaleHints(),
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

  // ── Folder card: Plus / Huddle Gold ──────────────────────────────────────────

  const renderPlanFolderCard = (tier: "plus" | "gold") => {
    const theme = PLAN_THEMES[tier];
    const monthlyAmt  = livePrices[`${tier}_monthly` as keyof LivePriceMap];
    const annualTotal = livePrices[`${tier}_annual`  as keyof LivePriceMap];
    const annualPerMo = annualTotal / 12;
    const pct = discountPct(monthlyAmt, annualTotal);
    const billing = tier === "plus" ? plusBilling : goldBilling;
    const setBilling = tier === "plus" ? setPlusBilling : setGoldBilling;
    const features = tier === "plus" ? PLUS_FEATURES : GOLD_FEATURES;
    const isAnnual = billing === "annual";
    const isBlockedByTier =
      normalizedTier === "gold" ||
      (normalizedTier === "plus" && tier === "plus");
    const ctaLabel = isBlockedByTier
      ? (normalizedTier === "gold" ? "You're on Huddle Gold" : "You're on Huddle+")
      : (tier === "plus" ? "Get Huddle+" : "Get Huddle Gold");

    return (
      <div className="rounded-[20px] overflow-hidden" style={CARD_FLOAT_STYLE}>

        {/* ── Folder tab row ── */}
        <div className="flex h-[44px]" style={{ background: theme.bg }}>

          {/* Monthly tab */}
          <button
            className="flex-1 flex items-center justify-center text-[13px] font-[600] h-full"
            aria-pressed={!isAnnual}
            onClick={() => setBilling("monthly")}
            style={
              !isAnnual
                ? { color: theme.textOnBg }                   // active: inherits theme bg, white text
                : {
                    background: "#FFFFFF",
                    color: theme.bg,
                    borderBottomRightRadius: "14px",           // fold corner
                  }
            }
          >
            Monthly
          </button>

          {/* Annual tab */}
          <button
            className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-[600] h-full"
            aria-pressed={isAnnual}
            onClick={() => setBilling("annual")}
            style={
              isAnnual
                ? { color: theme.textOnBg }
                : {
                    background: "#FFFFFF",
                    color: theme.bg,
                    borderBottomLeftRadius: "14px",            // fold corner
                  }
            }
          >
            Annually
            {/* Discount badge — visible only while Annual tab is inactive */}
            {!isAnnual && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-[500]"
                style={{ background: theme.bg, color: theme.textOnBg }}
              >
                -{pct}%
              </span>
            )}
          </button>
        </div>

        {/* ── Card body ── */}
        <div className="px-5 pt-4 pb-5" style={{ background: theme.bg }}>

          {/* Price */}
          {!isAnnual ? (
            <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
              <PriceDisplay n={monthlyAmt} currency={livePrices.currencyCode} />
              <span className="text-[14px] font-[400] ml-1 opacity-80">/mo</span>
            </p>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[15px] font-[400] line-through opacity-60"
                  style={{ color: theme.textOnBg }}
                >
                  <PriceDisplay n={monthlyAmt} currency={livePrices.currencyCode} />
                </span>
                <p className="text-[30px] font-[700] leading-tight" style={{ color: theme.textOnBg }}>
                  <PriceDisplay n={annualPerMo} currency={livePrices.currencyCode} />
                  <span className="text-[14px] font-[400] ml-1 opacity-80">/mo</span>
                </p>
              </div>
              <p className="text-[12px] mt-0.5 opacity-75" style={{ color: theme.textOnBg }}>
                <PriceDisplay n={annualTotal} currency={livePrices.currencyCode} /> billed yearly
              </p>
            </div>
          )}

          {/* Divider — price ↔ features */}
          <div
            className="mt-4 h-px"
            style={{ background: "rgba(255,255,255,0.28)" }}
          />

          {/* Feature rows */}
          <div className="mt-3 space-y-0">
            {features.map((f) => (
              <div key={f.label} className="flex items-start gap-3 py-2">
                <f.icon
                  size={18}
                  strokeWidth={1.75}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: theme.textOnBg, opacity: 0.90 }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-[600] leading-tight"
                    style={{ color: theme.textOnBg }}
                  >
                    {f.label}
                  </p>
                  <p
                    className="text-[11px] font-[400] mt-0.5"
                    style={{ color: theme.textOnBg, opacity: 0.72 }}
                  >
                    {f.sublabel}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA — white bg, themed text */}
          <button
            className="mt-5 w-full h-[50px] rounded-[16px] text-[15px] font-[600] flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: isBlockedByTier ? "#F4F5FA" : "#FFFFFF",
              color: isBlockedByTier ? "#99A0B3" : theme.bg,
              opacity: isCheckingOut ? 0.6 : 1,
            }}
            disabled={isCheckingOut || isBlockedByTier}
            onClick={() => void startPlanCheckout(tier)}
          >
            <ShoppingBag size={18} strokeWidth={1.75} aria-hidden />
            {isCheckingOut ? "Loading…" : ctaLabel}
          </button>
        </div>
      </div>
    );
  };

  // ── Add-ons folder card (single tab, white body) ───────────────────────────

  const renderAddonsCard = () => {
    const theme = PLAN_THEMES.addons;

    return (
      <div className="rounded-[20px] overflow-hidden" style={CARD_FLOAT_STYLE}>

        {/* Single lime-green header tab */}
        <div
          className="h-[44px] flex items-center px-5 gap-3"
          style={{ background: theme.bg }}
        >
          <span className="text-[13px] font-[600]" style={{ color: BRAND_BLUE }}>
            Power-ups
          </span>
          <span className="text-[11px] opacity-65" style={{ color: BRAND_BLUE }}>
            Billed once
          </span>
        </div>

        {/* White card body */}
        <div className="px-4 pt-2 pb-4" style={{ background: "#FFFFFF" }}>
          {ADD_ONS.map((addon, i) => {
            const selected = addonSelected[addon.id];
            return (
              <div key={addon.id}>
                {i > 0 && (
                  <div
                    className="h-px"
                    style={{ background: "rgba(33,69,207,0.10)" }}
                  />
                )}
                <div className="flex items-center gap-3 py-3.5">
                  <addon.icon
                    size={20}
                    strokeWidth={1.75}
                    className="flex-shrink-0"
                    style={{ color: BRAND_BLUE, opacity: 0.80 }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[13px] font-[600] leading-tight"
                      style={{ color: BRAND_BLUE }}
                    >
                      {addon.title}
                    </p>
                    <p
                      className="text-[11px] font-[400] mt-0.5"
                      style={{ color: BRAND_BLUE, opacity: 0.65 }}
                    >
                      {addon.subtitle}
                    </p>
                    <p
                      className="text-[13px] font-[600] mt-1"
                      style={{ color: BRAND_BLUE }}
                    >
                      <PriceDisplay
                        n={livePrices[addon.id as keyof LivePriceMap] ?? addon.price}
                        suffix={addon.billingNote}
                        currency={livePrices.currencyCode}
                      />
                    </p>
                  </div>

                  {/* White (+/−) circle button */}
                  <button
                    className="flex-shrink-0 w-[32px] h-[32px] rounded-full flex items-center justify-center transition-colors"
                    style={
                      selected
                        ? { background: BRAND_BLUE, color: "#FFFFFF" }
                        : {
                            background: "#FFFFFF",
                            color: BRAND_BLUE,
                            boxShadow: "0 1px 4px rgba(33,69,207,0.18), inset 0 0 0 1.5px rgba(33,69,207,0.22)",
                          }
                    }
                    onClick={() =>
                      setAddonSelected((prev) => ({ ...prev, [addon.id]: !prev[addon.id] }))
                    }
                    aria-label={`${selected ? "Remove" : "Add"} ${addon.title}`}
                  >
                    {selected
                      ? <Minus size={15} strokeWidth={2.5} aria-hidden />
                      : <Plus  size={15} strokeWidth={2.5} aria-hidden />
                    }
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add-ons CTA */}
          <button
            className="mt-2 w-full h-[50px] rounded-[16px] text-[15px] font-[600] flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: "#7CFF6B",
              color: BRAND_BLUE,
              opacity: !selectedAddonItems.length || isCheckingOut ? 0.38 : 1,
              pointerEvents: !selectedAddonItems.length || isCheckingOut ? "none" : "auto",
            }}
            disabled={!selectedAddonItems.length || isCheckingOut}
            onClick={() => void startAddonOnlyCheckout()}
          >
            <ShoppingBag size={18} strokeWidth={1.75} aria-hidden />
            {selectedAddonItems.length > 0
              ? <>Purchase Add-ons · <PriceDisplay n={addonTotal} currency={livePrices.currencyCode} /></>
              : "Purchase Add-ons"}
          </button>

          <p
            className="text-[11px] font-[400] text-center mt-3"
            style={{ color: BRAND_BLUE, opacity: 0.45 }}
          >
            Add-ons are purchased separately from your subscription.
          </p>
        </div>
      </div>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-svh overflow-x-hidden">
      <GlobalHeader closeButton={() => navigate(-1)} />

      <div
        className="overflow-y-auto"
        style={{ paddingBottom: "calc(90px + env(safe-area-inset-bottom))" }}
      >
        {/* Hero */}
        <div className="px-5 pt-5">
          <h1
            className="font-[700] text-[var(--text-primary)] leading-tight"
            style={{ fontSize: "28px", maxWidth: "22ch" }}
          >
            Every Pet Deserves More.
          </h1>
          <p
            className="font-[400] text-[var(--text-secondary)] mt-0.5"
            style={{ fontSize: "14px" }}
          >
            Connect wider. Care deeper. Make pet lives better.
          </p>
        </div>

        {/* Plan segmented control */}
        <div className="px-5 mt-10">
          <div className="flex gap-2 mt-5">
            {(["plus", "gold", "addons"] as PlanTab[]).map((tab) => {
              const isActive = activeTab === tab;
              const isGold = tab === "gold";
              const themeBg = PLAN_THEMES[tab].bg;
              const activeTextColor = PLAN_THEMES[tab].textOnBg;
              return (
                <div key={tab} className="flex-1 relative">
                  {/* "Recommended" — centered on the top border of Gold button */}
                  {isGold && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[72%] px-2 py-0.5 rounded-full text-[10px] font-[500] whitespace-nowrap pointer-events-none z-10"
                      style={{ background: "#E0F2B6", color: BRAND_BLUE }}
                      aria-hidden
                    >
                      Recommended
                    </span>
                  )}
                  <button
                    onClick={() => setActiveTab(tab)}
                    aria-pressed={isActive}
                    className="w-full h-[36px] rounded-[18px] text-[13px] font-[600]"
                    style={
                      isActive
                        ? { background: themeBg, color: tab === "addons" ? BRAND_BLUE : activeTextColor }
                        : {
                            background: "rgba(255,255,255,0.18)",
                            color: BRAND_BLUE,
                            boxShadow: "inset 2px 2px 6px rgba(163,168,190,0.20)",
                          }
                    }
                  >
                    {tab === "plus" ? "Huddle+" : tab === "gold" ? "Huddle Gold" : "Add-ons"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Folder card content */}
        <div className="px-5 mt-4">
          {activeTab === "plus"   && renderPlanFolderCard("plus")}
          {activeTab === "gold"   && renderPlanFolderCard("gold")}
          {activeTab === "addons" && renderAddonsCard()}
        </div>
      </div>
    </div>
  );
}
