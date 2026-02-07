import { useState, useEffect, type ComponentType } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  Star,
  AlertTriangle,
  Camera,
  Users,
  Sparkles,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

// Stripe product IDs are intentionally server-side only.

interface PlanFeature {
  name: string;
  free: boolean | string;
  premium: boolean | string;
  gold: boolean | string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "Family Slot", free: "—", premium: "—", gold: "1 Extra Member" },
  { name: "Thread", free: "1", premium: "5", gold: "30" },
  { name: "Discovery Filters", free: "Basic", premium: "Advanced", gold: "Advanced" },
  { name: "Visibility", free: "—", premium: "Priority", gold: "Priority" },
  { name: "Star", free: "—", premium: "—", gold: "3" },
  { name: "Media", free: "—", premium: "10", gold: "50" },
  { name: "Alert", free: "5", premium: "20", gold: "Unlimited" },
  { name: "Broadcast Range", free: "1km", premium: "5km", gold: "20km" },
  { name: "Ad-free", free: "—", premium: "—", gold: "✓" },
];

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: ComponentType<{ className?: string }>;
  type: string;
  quantity?: number;
}

const ADD_ONS: AddOn[] = [
  {
    id: "star_pack",
    name: "3 Star Pack",
    description: "Superpower to trigger chats immediately",
    price: 4.99,
    icon: Star,
    type: "star_pack",
    quantity: 3,
  },
  {
    id: "emergency_alert",
    name: "Broadcast Alert",
    description: "Additional broadcast alert",
    price: 2.99,
    icon: AlertTriangle,
    type: "emergency_alert",
    quantity: 1,
  },
  {
    id: "vet_media",
    name: "Additional 10 Media",
    description: "Additional 10 media usage across Social, Chats and AI Vet.",
    price: 3.99,
    icon: Camera,
    type: "vet_media",
    quantity: 10,
  },
];

const Premium = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [selectedTier, setSelectedTier] = useState<"premium" | "gold">("premium");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});

  const isPremium = profile?.tier === "premium";
  const isGold = profile?.tier === "gold";
  const hasActiveSubscription = isPremium || isGold;
  const totalFamilySlots = (profile?.tier === "gold" ? 1 : 0) + (profile?.family_slots || 0);

  // =====================================================
  // RACE CONDITION HANDLING: Poll for updates after payment
  // =====================================================
  useEffect(() => {
    if (sessionId && !hasActiveSubscription) {
      setIsPolling(true);
      toast.info(t("Processing your payment..."));

      const pollInterval = setInterval(async () => {
        await refreshProfile();
        const { data: updatedProfile } = await supabase
          .from("profiles")
          .select("tier, stars_count, mesh_alert_count, media_credits, family_slots, verified")
          .eq("id", user?.id)
          .single();

        if (updatedProfile && (updatedProfile.tier === "premium" || updatedProfile.tier === "gold")) {
          setIsPolling(false);
          clearInterval(pollInterval);
          toast.success(<span className="font-huddle">{t("Welcome to huddle Premium!")}</span>);
        }
      }, 2000);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (isPolling) {
          setIsPolling(false);
          clearInterval(pollInterval);
          toast.warning(t("Payment processing is taking longer than expected. Please check back in a few minutes."));
        }
      }, 30000);

      return () => clearInterval(pollInterval);
    }
  }, [sessionId, hasActiveSubscription]);

  // =====================================================
  // SUBSCRIPTION PRICING (dynamic from Stripe)
  // =====================================================
  const [pricing, setPricing] = useState({
    premium: {
      monthly: { price: 8.99, periodKey: "period.month" },
      yearly: { price: 80, periodKey: "period.year", monthlyEquivalent: 6.67, savingsKey: "premium.savings_26" },
    },
    gold: {
      monthly: { price: 19.99, periodKey: "period.month" },
      yearly: { price: 180, periodKey: "period.year", monthlyEquivalent: 15, savingsKey: "premium.savings_25" },
    },
  });

  const [addonPricing, setAddonPricing] = useState<Record<string, number>>({
    star_pack: 4.99,
    emergency_alert: 2.99,
    vet_media: 3.99,
  });

  useEffect(() => {
    const loadPricing = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-pricing");
        if (error) throw error;
        const prices = data?.prices || {};
        setPricing((prev) => ({
          premium: {
            ...prev.premium,
            monthly: { ...prev.premium.monthly, price: prices.premium_monthly?.amount ?? prev.premium.monthly.price },
            yearly: {
              ...prev.premium.yearly,
              price: prices.premium_annual?.amount ?? prev.premium.yearly.price,
              monthlyEquivalent: prices.premium_annual?.amount
                ? Number((prices.premium_annual.amount / 12).toFixed(2))
                : prev.premium.yearly.monthlyEquivalent,
            },
          },
          gold: {
            ...prev.gold,
            monthly: { ...prev.gold.monthly, price: prices.gold_monthly?.amount ?? prev.gold.monthly.price },
            yearly: {
              ...prev.gold.yearly,
              price: prices.gold_annual?.amount ?? prev.gold.yearly.price,
              monthlyEquivalent: prices.gold_annual?.amount
                ? Number((prices.gold_annual.amount / 12).toFixed(2))
                : prev.gold.yearly.monthlyEquivalent,
            },
          },
        }));

        setAddonPricing((prev) => ({
          ...prev,
          star_pack: prices.star_pack?.amount ?? prev.star_pack,
          emergency_alert: prices.emergency_alert?.amount ?? prev.emergency_alert,
          vet_media: prices.vet_media?.amount ?? prev.vet_media,
        }));
      } catch (err) {
        console.warn("[Premium] Failed to load Stripe pricing", err);
      }
    };
    loadPricing();
  }, []);

  const addToCart = (type: string) => {
    setCart((prev) => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
  };

  const removeFromCart = (type: string) => {
    setCart((prev) => {
      const next = { ...prev };
      if (!next[type]) return next;
      if (next[type] <= 1) {
        delete next[type];
      } else {
        next[type] -= 1;
      }
      return next;
    });
  };

  const cartItems = ADD_ONS.filter((addOn) => cart[addOn.type]).map((addOn) => ({
    ...addOn,
    cartQty: cart[addOn.type] || 0,
    unitPrice: addonPricing[addOn.type] ?? addOn.price,
  }));

  const cartTotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.cartQty, 0);

  const handleCheckoutCart = () => {
    if (cartItems.length === 0) return;
    createCheckoutSession({
      mode: "payment",
      items: cartItems.map((item) => ({ type: item.type, quantity: item.cartQty })),
      amount: Math.round(cartTotal * 100),
    });
  };

  // =====================================================
  // STRIPE CHECKOUT FUNCTIONS
  // =====================================================
  const createCheckoutSession = async (
    params: { type?: string; mode: "subscription" | "payment"; amount?: number; items?: { type: string; quantity: number }[] }
  ) => {
    if (!user) {
      toast.error(t("Please sign in first"));
      return;
    }

    setIsProcessing(true);

    try {
      const { type, mode, amount, items } = params;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          type,
          mode,
          items,
          amount,
          successUrl: `${window.location.origin}/premium?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/premium`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: unknown) {
      console.error("Checkout error:", error);
      toast.error(t("Failed to create checkout session"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubscribe = () => {
    const tierType = selectedTier === "gold" ? "gold" : "premium";
    const planType = selectedPlan === "yearly" ? "annual" : "monthly";
    createCheckoutSession({ type: `${tierType}_${planType}`, mode: "subscription" });
  };

  const handleManageBilling = async () => {
    if (!user) return;

    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          userId: user.id,
          returnUrl: `${window.location.origin}/premium`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: unknown) {
      console.error("Portal error:", error);
      toast.error(t("Failed to open billing portal"));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold font-huddle">{t("huddle Premium")}</h1>
      </header>

      <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-gradient-to-br from-[#3283FF] via-[#1E40AF] to-[#1E3A8A] rounded-2xl p-6 mb-6 overflow-hidden"
          style={{
            boxShadow: "0 8px 32px rgba(37, 99, 235, 0.3)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -top-20 -right-20 w-40 h-40 bg-white/10 rounded-full"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full"
            />
          </div>
          <div className="relative text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1 font-huddle">{t("huddle Premium")}</h2>
            <p className="text-white/90 text-sm font-huddle">{t("Unlock the full huddle experience")}</p>
          </div>
        </motion.div>

        {/* Current Status */}
        {hasActiveSubscription && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "rounded-xl p-4 mb-6",
              isGold
                ? "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20"
                : "bg-primary/10"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isGold
                    ? "bg-gradient-to-r from-amber-400 to-amber-500"
                    : "bg-[#3283FF]"
                )}
              >
                {isGold ? (
                  <Crown className="w-5 h-5 text-amber-900" />
                ) : (
                  <Sparkles className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    isGold
                      ? "text-amber-800 dark:text-amber-200"
                      : "text-primary"
                  )}
                >
                  {isGold ? t("You're a Gold Member!") : t("You're a Premium Member!")}
                </p>
                <p
                  className={cn(
                    "text-sm",
                    isGold
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-primary/80"
                  )}
                >
                  {t("Status:")} {profile?.subscription_status || t("active")}
                </p>
              </div>
              <Button
                onClick={handleManageBilling}
                disabled={isProcessing}
                variant="outline"
                size="sm"
                className="ml-auto"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("Manage")}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Processing Indicator */}
        {isPolling && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center gap-3"
          >
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <div>
              <p className="font-semibold text-primary">{t("Processing Payment...")}</p>
              <p className="text-sm text-muted-foreground">{t("This may take a few seconds")}</p>
            </div>
          </motion.div>
        )}

        {/* User Credits Display (Read-Only - RLS Protected) */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">{t("Stars")}</span>
            </div>
            <p className="text-2xl font-bold">{profile?.stars_count || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground">{t("Alerts")}</span>
            </div>
            <p className="text-2xl font-bold">{profile?.mesh_alert_count || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Camera className="w-4 h-4 text-[#3283FF]" />
              <span className="text-xs font-medium text-muted-foreground">{t("Media")}</span>
            </div>
            <p className="text-2xl font-bold">{profile?.media_credits || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-[#A6D539]" />
              <span className="text-xs font-medium text-muted-foreground">{t("Family")}</span>
            </div>
            <p className="text-2xl font-bold">{totalFamilySlots}</p>
          </div>
        </div>

        {/* Compare Plans Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="grid grid-cols-4 bg-muted/50">
            <div className="p-3">
              <span className="text-xs font-medium text-muted-foreground">{t("Feature")}</span>
            </div>
            <div className="p-3 text-center border-l border-border">
              <span className="text-xs font-medium">{t("Free")}</span>
            </div>
            <div className="p-3 text-center border-l border-border bg-primary/5">
              <span className="text-xs font-semibold text-primary">
                {t("Premium")}
              </span>
            </div>
            <div className="p-3 text-center border-l border-border bg-amber-50 dark:bg-amber-900/20">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">{t("Gold")}</span>
            </div>
          </div>

          {PLAN_FEATURES.map((feature, i) => (
            <div
              key={feature.name}
              className={cn("grid grid-cols-4", i % 2 === 0 && "bg-muted/30")}
            >
              <div className="p-3 text-xs">{t(feature.name)}</div>
              <div className="p-3 text-center border-l border-border">
                {typeof feature.free === "boolean" ? (
                  feature.free ? (
                    <Check className="w-3 h-3 text-accent mx-auto" />
                  ) : (
                      <span className="text-muted-foreground">{t("—")}</span>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">{t(feature.free)}</span>
                )}
              </div>
              <div className="p-3 text-center border-l border-border bg-primary/5">
                {typeof feature.premium === "boolean" ? (
                  feature.premium ? (
                    <Check className="w-3 h-3 text-[#3283FF] mx-auto" />
                  ) : (
                      <span className="text-muted-foreground">{t("—")}</span>
                  )
                ) : (
                  <span className="text-xs font-medium text-primary">
                    {t(feature.premium)}
                  </span>
                )}
              </div>
              <div className="p-3 text-center border-l border-border bg-amber-50/50 dark:bg-amber-900/10">
                {typeof feature.gold === "boolean" ? (
                  feature.gold ? (
                    <Check className="w-3 h-3 text-amber-600 mx-auto" />
                  ) : (
                      <span className="text-muted-foreground">{t("—")}</span>
                  )
                ) : (
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {t(feature.gold)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Subscription Plans (Only for non-subscribed users) */}
        {!hasActiveSubscription && (
          <>
            {/* Tier Selector */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setSelectedTier("premium")}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  selectedTier === "premium"
                    ? "border-[#3283FF] bg-[#3283FF]/5"
                    : "border-border hover:border-[#3283FF]/50"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-[#3283FF]" />
                  <span className="font-bold">{t("Premium")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("Best for individuals")}</p>
              </button>

              <button
                onClick={() => setSelectedTier("gold")}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  selectedTier === "gold"
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                    : "border-border hover:border-amber-500/50"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <span className="font-bold">{t("Gold")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("Ultimate experience")}</p>
              </button>
            </div>

            {/* Billing Period */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => setSelectedPlan("monthly")}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  selectedPlan === "monthly"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("Monthly")}</p>
                <p className="text-2xl font-bold">
                  ${pricing[selectedTier].monthly.price}
                </p>
                <p className="text-xs text-muted-foreground">{t("per month")}</p>
              </button>

              <button
                onClick={() => setSelectedPlan("yearly")}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all relative",
                  selectedPlan === "yearly"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <span className="absolute -top-2 right-2 bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                  {t(pricing[selectedTier].yearly.savingsKey)}
                </span>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t("Yearly")}</p>
                <p className="text-2xl font-bold">${pricing[selectedTier].yearly.price}</p>
                <p className="text-xs text-muted-foreground">
                  {t("per_month_short").replace(
                    "{value}",
                    pricing[selectedTier].yearly.monthlyEquivalent.toFixed(2)
                  )}
                </p>
              </button>
            </div>

            {/* Subscribe Button */}
            <Button
              onClick={handleSubscribe}
              disabled={isProcessing}
              className={cn(
                "w-full py-6 text-lg gap-2 mb-6",
                selectedTier === "gold"
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-900"
                  : "bg-gradient-to-r from-[#3283FF] to-[#1E40AF] hover:from-[#1E40AF] hover:to-[#1E3A8A] text-white"
              )}
              style={{
                boxShadow:
                  selectedTier === "gold"
                    ? "0 4px 20px rgba(251, 191, 36, 0.4)"
                    : "0 4px 20px rgba(50, 131, 255, 0.4)",
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t("Processing...")}
                </>
              ) : (
                <>
                  {selectedTier === "gold" ? (
                    <Crown className="w-5 h-5" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {t("Upgrade to")} {selectedTier === "gold" ? t("Gold") : t("Premium")}
                </>
              )}
            </Button>
          </>
        )}

        {/* Add-on Store */}
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-4">{t("Add-ons")}</h3>
          <div className="grid grid-cols-2 gap-3">
            {ADD_ONS.map((addOn) => {
              const unitPrice = addonPricing[addOn.type] ?? addOn.price;
              const qty = cart[addOn.type] || 0;
              return (
              <motion.div
                key={addOn.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      addOn.id === "star_pack" && "bg-amber-100 dark:bg-amber-900/20",
                      addOn.id === "emergency_alert" && "bg-red-100 dark:bg-red-900/20",
                      addOn.id === "vet_media" && "bg-primary/10 dark:bg-primary/20"
                    )}
                  >
                    <addOn.icon className="w-5 h-5" />
                  </div>
                  {addOn.quantity && (
                    <span className="text-xs font-bold text-primary">×{addOn.quantity}</span>
                  )}
                </div>
                <h4 className="font-semibold text-sm mb-1">{t(addOn.name)}</h4>
                <p className="text-xs text-muted-foreground mb-3">{t(addOn.description)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">${unitPrice.toFixed(2)}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => removeFromCart(addOn.type)}
                      disabled={qty === 0 || isProcessing}
                      size="sm"
                      variant="outline"
                    >
                      -
                    </Button>
                    <span className="text-xs font-semibold min-w-[18px] text-center">{qty}</span>
                    <Button
                      onClick={() => addToCart(addOn.type)}
                      disabled={isProcessing}
                      size="sm"
                      variant="outline"
                    >
                      {t("Add")}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )})}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{t("Add-on Cart")}</span>
              <span className="text-sm font-bold">${cartTotal.toFixed(2)}</span>
            </div>
            {cartItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("No add-ons selected")}</p>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => (
                  <div key={item.type} className="flex items-center justify-between text-xs">
                    <span>{t(item.name)} ×{item.cartQty}</span>
                    <span>${(item.unitPrice * item.cartQty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={handleCheckoutCart}
              disabled={isProcessing || cartItems.length === 0}
              className="w-full mt-3"
            >
              {isProcessing ? t("Processing...") : t("Checkout Add-ons")}
            </Button>
          </div>
        </div>

        {/* Past Transactions (Demo) */}
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3">{t("Past Transactions")}</h3>
          <div className="space-y-2">
            {[
              { label: "Premium Monthly", amount: "$8.99", date: "Jan 5, 2026", status: "Completed" },
              { label: "3 Star Pack", amount: "$4.99", date: "Dec 22, 2025", status: "Completed" },
              { label: "Broadcast Alert", amount: "$2.99", date: "Dec 10, 2025", status: "Completed" },
            ].map((row) => (
              <div key={`${row.label}-${row.date}`} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-xs">
                <div>
                  <p className="font-semibold">{t(row.label)}</p>
                  <p className="text-muted-foreground">{t(row.date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{row.amount}</p>
                  <p className="text-muted-foreground">{t(row.status)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <span className="text-xs text-muted-foreground">
            {t("Secure payments powered by Stripe")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Premium;
