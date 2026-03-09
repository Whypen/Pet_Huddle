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
import { PaywallCTA } from "@/components/paywall/PaywallCTA";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { quotaConfig } from "@/config/quotaConfig";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanTab = "plus" | "gold" | "addons";
type Billing = "monthly" | "annual";

type FeatureRow = {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
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

const PLUS_FEATURES: FeatureRow[] = [
  { icon: Users,             label: "×2 Discovery",     sublabel: "More connections, less noise" },
  { icon: Star,              label: "4 Stars / month",  sublabel: "Trigger conversations directly" },
  { icon: Radio,             label: "Broadcasts · 25km · 24h", sublabel: "Alert your neighbourhood" },
  { icon: SlidersHorizontal, label: "Advanced Filters", sublabel: "Find your kind of people" },
  { icon: Heart,             label: "Link Family",      sublabel: "Connect all your pet accounts" },
];

const GOLD_FEATURES: FeatureRow[] = [
  { icon: Globe,             label: "Wide Open Discovery",   sublabel: "Keep discovering" },
  { icon: TrendingUp,        label: "3× Visibility priority", sublabel: "Become a top profile" },
  { icon: Star,              label: "10 Stars / month",      sublabel: "The most direct connections" },
  { icon: Radio,             label: "Broadcasts · 50km · 48h", sublabel: "Maximum reach" },
  { icon: SlidersHorizontal, label: "All Filters Access",   sublabel: "Including Active Now + Same Energy" },
  { icon: Video,             label: "Video upload",          sublabel: "Gold-exclusive" },
  { icon: Users2,            label: "Link Family",           sublabel: "Connect all your pet accounts" },
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

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
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
      // Plan only — clear param
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

    // Auto-trigger add-on payment session
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
        console.log("[Premium] Checkout URL:", url); // live verification
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
    return (
      <div className="mt-6">
        {/* Toggle pill */}
        <div className="inline-flex rounded-full bg-[rgba(255,255,255,0.18)] shadow-[inset_2px_2px_6px_rgba(163,168,190,0.20)] p-[4px] gap-1 relative">
          {/* Annual -17% badge */}
          <span
            className="absolute -top-5 right-[4px] px-2 py-0.5 rounded-full text-[10px] font-[500]"
            style={{ background: "#E0F2B6", color: "#2145CF" }}
          >
            -17%
          </span>

          <NeuControl
            size="sm"
            variant={billing === "monthly" ? "primary" : "tertiary"}
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
          >
            Monthly
          </NeuControl>
          <NeuControl
            size="sm"
            variant={billing === "annual" ? "primary" : "tertiary"}
            onClick={() => setBilling("annual")}
            aria-pressed={billing === "annual"}
          >
            Annual
          </NeuControl>
        </div>

        {/* Price display */}
        <div className="mt-4">
          {billing === "monthly" ? (
            <p className="text-[28px] font-[700] text-[var(--text-primary)] leading-tight">
              {fmt(prices.monthly)}
              <span className="text-[14px] font-[400] text-[var(--text-secondary)] ml-1">/mo</span>
            </p>
          ) : (
            <>
              <p className="text-[28px] font-[700] text-[var(--text-primary)] leading-tight">
                {fmt(prices.annual)}
                <span className="text-[14px] font-[400] text-[var(--text-secondary)] ml-1">/mo</span>
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                Billed {fmt(prices.annualBilled)}/yr
              </p>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderFeatureRows = (features: FeatureRow[], iconColor: string) => (
    <div className="mt-6 space-y-0">
      {features.map((f) => (
        <div key={f.label} className="flex items-start gap-3 py-3">
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
      {renderFeatureRows(PLUS_FEATURES, "#2145CF")}

      {/* Plus CTA — PaywallCTA blackpill */}
      <div className="mt-6">
        <PaywallCTA
          tier="plus"
          label={isCheckingOut ? "Loading…" : "Get Huddle+"}
          icon={<ShoppingCart size={18} strokeWidth={1.75} aria-hidden />}
          iconPosition="left"
          fullWidth
          disabled={isCheckingOut}
          onClick={() => void startPlanCheckout("plus")}
        />
      </div>
    </div>
  );

  const renderGoldTab = () => (
    <div className="px-5">
      {renderBillingToggle("gold")}

      {/* RULE 8: Gold icon color #CFAB21 only inside Gold tab */}
      {renderFeatureRows(GOLD_FEATURES, "#CFAB21")}

      {/* Gold CTA — gold gradient per Section 6 Gold recipe */}
      <div className="mt-6">
        <NeuControl
          variant="gold"
          tier="gold"
          size="xl"
          fullWidth
          disabled={isCheckingOut}
          onClick={() => void startPlanCheckout("gold")}
        >
          <ShoppingCart size={18} strokeWidth={1.75} aria-hidden />
          {isCheckingOut ? "Loading…" : "Get Gold"}
        </NeuControl>
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

      {/* Add-on rows — glass-e1 InsetPanel */}
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
        <NeuControl
          size="lg"
          variant="primary"
          fullWidth
          disabled={!selectedAddonItems.length || isCheckingOut}
          onClick={() => void startAddonOnlyCheckout()}
          style={
            !selectedAddonItems.length
              ? { opacity: 0.38, pointerEvents: "none" }
              : undefined
          }
        >
          <ShoppingBag size={18} strokeWidth={1.75} aria-hidden />
          {selectedAddonItems.length > 0
            ? `Purchase Add-ons · ${fmt(addonTotal)}`
            : "Purchase Add-ons"}
        </NeuControl>
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
        style={{
          paddingBottom: "calc(90px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Hero block */}
        <div
          className="px-5"
          style={{ marginTop: "calc(56px + 24px)" }}
        >
          <h1
            className="font-[700] text-[var(--text-primary)] leading-tight"
            style={{ fontSize: "28px", maxWidth: "22ch" }}
          >
            Every Pet Deserves More.
          </h1>
          <p
            className="font-[400] text-[var(--text-secondary)] mt-2"
            style={{ fontSize: "15px", maxWidth: "36ch" }}
          >
            Connect wider. Care deeper. Make pet lives better.
          </p>
        </div>

        {/* Plan segmented control */}
        <div className="px-5 mt-8 relative">
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

          {/* Segmented buttons */}
          <div className="flex gap-2 mt-5">
            {(["plus", "gold", "addons"] as PlanTab[]).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <NeuControl
                  key={tab}
                  size="sm"
                  variant={isActive ? "primary" : "tertiary"}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 text-[13px]"
                  style={
                    isActive
                      ? {
                          backgroundColor: "#FF4D4D",
                          color: "#FFFFFF",
                          border: "2px solid #2145CF",
                        }
                      : undefined
                  }
                  aria-pressed={isActive}
                >
                  {tab === "plus" ? "Huddle+" : tab === "gold" ? "Gold" : "Add-ons"}
                </NeuControl>
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
