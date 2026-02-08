import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

type TierTab = "Premium" | "Gold" | "Add-on";
type Billing = "monthly" | "yearly";

type Pricing = {
  premium: { monthly: number; yearly: number };
  gold: { monthly: number; yearly: number };
  addOn: { star_pack: number; broadcast_alert: number; media_10: number };
};

type AddOnId = keyof Pricing["addOn"];

type AddOn = {
  id: AddOnId;
  title: string;
  subtitle: string;
  pill?: string;
};

const DEFAULT_PRICING: Pricing = {
  premium: { monthly: 8.99, yearly: 80.99 },
  gold: { monthly: 19.99, yearly: 180.99 },
  addOn: { star_pack: 4.99, broadcast_alert: 2.99, media_10: 3.99 },
};

const ADD_ONS: AddOn[] = [
  { id: "star_pack", title: "3 Star Pack", subtitle: "Superpower to trigger chats immediately" },
  { id: "broadcast_alert", title: "Broadcast Alert", subtitle: "Additional broadcast alert", pill: "72H" },
  { id: "media_10", title: "Additional 10 media", subtitle: "Additional 10 media usage across Social, Chats and AI Vet." },
];

const FEATURES = (tier: "premium" | "gold") =>
  tier === "premium"
    ? [
        { title: "Unlimited", tip: "More discovery and social access", icon: Sparkles },
        { title: "Threads", tip: "5 threads/month", icon: CheckCircle2 },
        { title: "Broadcast", tip: "5km range", icon: CheckCircle2 },
      ]
    : [
        { title: "Unlimited", tip: "Ultra-wide visibility and perks", icon: Sparkles },
        { title: "Threads", tip: "30 threads/month", icon: CheckCircle2 },
        { title: "Broadcast", tip: "20km range", icon: CheckCircle2 },
      ];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function PremiumPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  // UAT: auto-select Premium on load.
  const [tab, setTab] = useState<TierTab>("Premium");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [selected, setSelected] = useState<Record<AddOnId, boolean>>({
    star_pack: false,
    broadcast_alert: false,
    media_10: false,
  });
  const [qty, setQty] = useState<Record<AddOnId, number>>({
    star_pack: 1,
    broadcast_alert: 1,
    media_10: 1,
  });

  const fade = useRef(0);

  useEffect(() => {
    // UAT: dynamic pricing from Stripe if available (fallback to defaults).
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-pricing");
        if (error) throw error;
        const prices = data?.prices || {};
        setPricing((prev) => ({
          premium: {
            monthly: prices.premium_monthly?.amount ?? prev.premium.monthly,
            yearly: prices.premium_annual?.amount ?? prev.premium.yearly,
          },
          gold: {
            monthly: prices.gold_monthly?.amount ?? prev.gold.monthly,
            yearly: prices.gold_annual?.amount ?? prev.gold.yearly,
          },
          addOn: {
            star_pack: prices.star_pack?.amount ?? prev.addOn.star_pack,
            broadcast_alert: prices.emergency_alert?.amount ?? prev.addOn.broadcast_alert,
            media_10: prices.vet_media?.amount ?? prev.addOn.media_10,
          },
        }));
      } catch {
        // ignore
      }
    })();
  }, []);

  const cartItems = useMemo(() => {
    return ADD_ONS.filter((a) => selected[a.id]).map((a) => ({
      ...a,
      qty: Math.min(10, Math.max(1, qty[a.id] ?? 1)),
      price: pricing.addOn[a.id],
    }));
  }, [pricing.addOn, qty, selected]);

  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + i.qty * i.price, 0), [cartItems]);

  const purchaseLabel = useMemo(() => {
    if (tab === "Add-on") return `Total ${money(cartTotal)}`;
    const tier = tab === "Gold" ? "gold" : "premium";
    const p = pricing[tier][billing];
    return `${money(p)} / ${billing === "monthly" ? "month" : "year"}`;
  }, [billing, cartTotal, pricing, tab]);

  const secureCheckout = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (tab === "Add-on") {
      if (!cartItems.length) return;
      // UAT: cart multi-select; server-side checkout handled by Edge Function.
      await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          mode: "payment",
          items: cartItems.map((i) => ({ type: i.id, quantity: i.qty })),
          amount: Math.round(cartTotal * 100),
          successUrl: `${window.location.origin}/premium`,
          cancelUrl: `${window.location.origin}/premium`,
        },
      });
      return;
    }

    const type = `${tab === "Gold" ? "gold" : "premium"}_${billing === "monthly" ? "monthly" : "annual"}`;
    await supabase.functions.invoke("create-checkout-session", {
      body: {
        userId: user.id,
        mode: "subscription",
        type,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: `${window.location.origin}/premium`,
      },
    });
  };

  const TierTabs = (
    <div className="sticky top-12 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 shadow-[0_6px_16px_-16px_rgba(0,0,0,0.35)]">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 rounded-[12px] border border-gray-300 p-1 bg-white">
          {(["Premium", "Gold", "Add-on"] as const).map((tName) => {
            const active = tab === tName;
            return (
              <button
                key={tName}
                onClick={() => {
                  setTab(tName);
                  // UAT: 0.3s fade-in transition
                  fade.current += 1;
                }}
                className={cn(
                  "relative flex-1 h-10 rounded-[12px] text-sm transition-opacity",
                  active ? "font-bold text-brandGold" : "text-brandText/70"
                )}
              >
                <span className="relative inline-flex items-center justify-center w-full h-full">
                  {tName === "Gold" ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-purple-500 text-white font-semibold">
                      Recommended
                    </span>
                  ) : null}
                  {tName}
                </span>
                {active ? (
                  <span className="absolute left-3 right-3 bottom-0 h-[2px] bg-brandGold rounded-full" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const Content = (
    <motion.div
      key={`${tab}-${fade.current}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pb-[110px]"
    >
      <div className="pt-4">
        <p className="text-sm text-gray-600">
          {tab === "Premium"
            ? "Best for Pet Lovers"
            : tab === "Gold"
              ? "Ultimate Experience"
              : "Add on extra privileges any time."}
        </p>
      </div>

      {tab === "Premium" || tab === "Gold" ? (
        <>
          <div className="mt-4 space-y-3">
            {([
              {
                id: "monthly" as const,
                label: "Monthly",
                price: tab === "Gold" ? pricing.gold.monthly : pricing.premium.monthly,
              },
              {
                id: "yearly" as const,
                label: "Yearly",
                price: tab === "Gold" ? pricing.gold.yearly : pricing.premium.yearly,
                pill: tab === "Gold" ? "Save 25%" : "Save 26%",
              },
            ] as const).map((p) => {
              const active = billing === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setBilling(p.id)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-[12px] border p-3 transition-transform",
                    active ? "border-brandGold" : "border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-4 h-4 rounded-full border-2",
                        active ? "border-brandGold bg-brandGold" : "border-gray-300"
                      )}
                    />
                    <span className="text-sm font-semibold text-brandText">
                      {p.label} {money(p.price)}
                    </span>
                  </div>
                  {p.pill ? (
                    <span className={cn("text-xs px-2 py-1 rounded-full font-semibold", tab === "Gold" ? "bg-brandGold/15 text-brandGold" : "bg-brandBlue/10 text-brandBlue")}>
                      {p.pill}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {FEATURES(tab === "Gold" ? "gold" : "premium").map((f) => (
              <button key={f.title} className="w-full flex items-start gap-3 py-3">
                <f.icon className="w-6 h-6 text-brandBlue" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-bold text-brandText">{f.title}</div>
                  <div className="text-xs text-gray-600 mt-1">{f.tip}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-brandText/60 mt-1" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          {ADD_ONS.map((a) => {
            const checked = selected[a.id];
            const q = qty[a.id] ?? 1;
            return (
              <div key={a.id} className="rounded-2xl border border-gray-300 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelected((s) => ({ ...s, [a.id]: !s[a.id] }));
                          setQty((x) => ({ ...x, [a.id]: Math.min(10, Math.max(1, x[a.id] ?? 1)) }));
                        }}
                        className={cn(
                          "w-6 h-6 rounded-[8px] border-2",
                          checked ? "border-brandGold bg-brandGold" : "border-gray-300"
                        )}
                        aria-label={a.title}
                      />
                      <div className="text-sm font-bold text-brandText">{a.title}</div>
                      {a.pill ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-brandText/80 font-semibold">
                          {a.pill}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{a.subtitle}</div>
                  </div>
                  <div className="text-sm font-bold text-brandText">{money(pricing.addOn[a.id])}</div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty((x) => ({ ...x, [a.id]: Math.max(1, (x[a.id] ?? 1) - 1) }))}
                      disabled={!checked}
                      className={cn(
                        "w-9 h-9 rounded-[10px] border border-gray-300 font-black",
                        !checked && "opacity-40"
                      )}
                    >
                      -
                    </button>
                    <div className="w-8 text-center font-black text-brandText">{checked ? q : 0}</div>
                    <button
                      onClick={() => setQty((x) => ({ ...x, [a.id]: Math.min(10, (x[a.id] ?? 1) + 1) }))}
                      disabled={!checked}
                      className={cn(
                        "w-9 h-9 rounded-[10px] border border-gray-300 font-black",
                        !checked && "opacity-40"
                      )}
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => setSelected((s) => ({ ...s, [a.id]: true }))}
                    disabled={!checked}
                    className={cn(
                      "px-4 py-2 rounded-xl bg-brandBlue text-white font-bold",
                      !checked && "opacity-50"
                    )}
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      <div className="px-4 pt-4">
        <h1 className="text-xl font-semibold text-brandText">Choose Your Privileges</h1>
      </div>

      {TierTabs}
      {Content}

      {/* UAT: fixed bottom purchase area (height: 90px) */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white shadow-[0_-10px_22px_-18px_rgba(0,0,0,0.35)] border-t border-border">
        <div className="max-w-md mx-auto h-[90px] px-4 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-brandText">
              {tab === "Add-on"
                ? `Cart ${cartItems.reduce((s, i) => s + i.qty, 0)}`
                : tab === "Gold"
                  ? "Gold"
                  : "Premium"}
            </div>
            <div className="text-base font-bold text-brandText">{purchaseLabel}</div>
          </div>

          <button
            onClick={secureCheckout}
            disabled={tab === "Add-on" && cartItems.length === 0}
            className={cn(
              "mt-2 w-full rounded-lg bg-brandBlue text-white font-bold py-2 flex items-center justify-center gap-2",
              tab === "Add-on" && cartItems.length === 0 && "opacity-50"
            )}
          >
            <Lock className="w-4 h-4" />
            Secure Privileges
          </button>

          <div className="mt-1 text-[10px] text-gray-500">
            <button onClick={() => navigate("/terms")} className="text-brandBlue underline font-semibold">
              Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

