import { useState, useEffect } from "react";
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
  Shield,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Stripe product IDs are intentionally server-side only.

interface PlanFeature {
  name: string;
  free: boolean | string;
  premium: boolean | string;
  gold: boolean | string;
}

const PLAN_FEATURES: PlanFeature[] = [
  { name: "Badge Type", free: "Grey", premium: "Blue Premium", gold: "Gold Crown" },
  { name: "Chat Access", free: "Limited", premium: "Unlimited", gold: "Unlimited + Priority" },
  { name: "AI Vet", free: "Text Only", premium: "Photo + Audio", gold: "Unlimited Media" },
  { name: "Broadcast Range", free: "1 mile", premium: "5 miles", gold: "10 miles" },
  { name: "Social Filters", free: "Basic", premium: "Advanced", gold: "Advanced + Boosts" },
  { name: "Ghost Mode", free: false, premium: true, gold: true },
  { name: "Notice Board", free: false, premium: true, gold: true },
  { name: "Priority Support", free: false, premium: false, gold: true },
  { name: "Marketplace Priority", free: false, premium: false, gold: true },
  { name: "Ad-free Experience", free: false, premium: true, gold: true },
];

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: any;
  type: string;
  quantity?: number;
}

const ADD_ONS: AddOn[] = [
  {
    id: "star_pack",
    name: "3 Star Pack",
    description: "Boost your profile visibility",
    price: 4.99,
    icon: Star,
    type: "star_pack",
    quantity: 3,
  },
  {
    id: "emergency_alert",
    name: "Emergency Mesh Alert",
    description: "Lost pet emergency broadcast",
    price: 2.99,
    icon: AlertTriangle,
    type: "emergency_alert",
    quantity: 1,
  },
  {
    id: "vet_media",
    name: "10 AI Vet Media Credits",
    description: "Upload photos/videos to AI Vet",
    price: 3.99,
    icon: Camera,
    type: "vet_media",
    quantity: 10,
  },
  {
    id: "family_slot",
    name: "Family Member Slot",
    description: "Add 1 family member to account",
    price: 5.99,
    icon: Users,
    type: "family_slot",
    quantity: 1,
  },
  {
    id: "verified_badge",
    name: "Verified Badge",
    description: "One-time ID verification",
    price: 9.99,
    icon: Shield,
    type: "verified_badge",
  },
];

const Premium = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [selectedTier, setSelectedTier] = useState<"premium" | "gold">("premium");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const isPremium = profile?.tier === "premium";
  const isGold = profile?.tier === "gold";
  const hasActiveSubscription = isPremium || isGold;

  // =====================================================
  // RACE CONDITION HANDLING: Poll for updates after payment
  // =====================================================
  useEffect(() => {
    if (sessionId && !hasActiveSubscription) {
      setIsPolling(true);
      toast.info("Processing your payment...");

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
          toast.success("Welcome to huddle Premium!");
        }
      }, 3000);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (isPolling) {
          setIsPolling(false);
          clearInterval(pollInterval);
          toast.warning("Payment processing is taking longer than expected. Please check back in a few minutes.");
        }
      }, 30000);

      return () => clearInterval(pollInterval);
    }
  }, [sessionId, hasActiveSubscription]);

  // =====================================================
  // SUBSCRIPTION PRICING
  // =====================================================
  const pricing = {
    premium: {
      monthly: { price: 8.99, period: "month" },
      yearly: { price: 80, period: "year", monthlyEquivalent: 6.67, savings: "Save 26%" },
    },
    gold: {
      monthly: { price: 19.99, period: "month" },
      yearly: { price: 180, period: "year", monthlyEquivalent: 15, savings: "Save 25%" },
    },
  };

  // =====================================================
  // STRIPE CHECKOUT FUNCTIONS
  // =====================================================
  const createCheckoutSession = async (type: string, mode: "subscription" | "payment", amount?: number) => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          userId: user.id,
          type,
          mode,
          amount,
          successUrl: `${window.location.origin}/premium?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/premium`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error("Failed to create checkout session");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubscribe = () => {
    const tierType = selectedTier === "gold" ? "gold" : "premium";
    const planType = selectedPlan === "yearly" ? "annual" : "monthly";
    createCheckoutSession(`${tierType}_${planType}`, "subscription");
  };

  const handleBuyAddOn = (addOn: AddOn) => {
    createCheckoutSession(addOn.type, "payment", addOn.price * 100);
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
    } catch (error: any) {
      console.error("Portal error:", error);
      toast.error("Failed to open billing portal");
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
        <h1 className="text-xl font-bold">huddle Premium</h1>
      </header>

      <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#1D4ED8] rounded-2xl p-6 mb-6 overflow-hidden"
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
            <h2 className="text-2xl font-bold text-white mb-1">huddle Premium</h2>
            <p className="text-white/90 text-sm">Unlock the full huddle experience</p>
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
                : "bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isGold
                    ? "bg-gradient-to-r from-amber-400 to-amber-500"
                    : "bg-gradient-to-r from-blue-400 to-blue-500"
                )}
              >
                {isGold ? (
                  <Crown className="w-5 h-5 text-amber-900" />
                ) : (
                  <Sparkles className="w-5 h-5 text-blue-900" />
                )}
              </div>
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    isGold
                      ? "text-amber-800 dark:text-amber-200"
                      : "text-blue-800 dark:text-blue-200"
                  )}
                >
                  You're a {isGold ? "Gold" : "Premium"} Member!
                </p>
                <p
                  className={cn(
                    "text-sm",
                    isGold
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-blue-600 dark:text-blue-400"
                  )}
                >
                  Status: {profile?.subscription_status || "active"}
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
                Manage
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
              <p className="font-semibold text-primary">Processing Payment...</p>
              <p className="text-sm text-muted-foreground">This may take a few seconds</p>
            </div>
          </motion.div>
        )}

        {/* User Credits Display (Read-Only - RLS Protected) */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">Stars</span>
            </div>
            <p className="text-2xl font-bold">{profile?.stars_count || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground">Alerts</span>
            </div>
            <p className="text-2xl font-bold">{profile?.mesh_alert_count || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Camera className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-muted-foreground">Media</span>
            </div>
            <p className="text-2xl font-bold">{profile?.media_credits || 0}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground">Family</span>
            </div>
            <p className="text-2xl font-bold">{profile?.family_slots || 0}</p>
          </div>
        </div>

        {/* Compare Plans Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="grid grid-cols-4 bg-muted/50">
            <div className="p-3">
              <span className="text-xs font-medium text-muted-foreground">Feature</span>
            </div>
            <div className="p-3 text-center border-l border-border">
              <span className="text-xs font-medium">Free</span>
            </div>
            <div className="p-3 text-center border-l border-border bg-blue-50 dark:bg-blue-900/20">
              <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                Premium
              </span>
            </div>
            <div className="p-3 text-center border-l border-border bg-amber-50 dark:bg-amber-900/20">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Gold</span>
            </div>
          </div>

          {PLAN_FEATURES.map((feature, i) => (
            <div
              key={feature.name}
              className={cn("grid grid-cols-4", i % 2 === 0 && "bg-muted/30")}
            >
              <div className="p-3 text-xs">{feature.name}</div>
              <div className="p-3 text-center border-l border-border">
                {typeof feature.free === "boolean" ? (
                  feature.free ? (
                    <Check className="w-3 h-3 text-accent mx-auto" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">{feature.free}</span>
                )}
              </div>
              <div className="p-3 text-center border-l border-border bg-blue-50/50 dark:bg-blue-900/10">
                {typeof feature.premium === "boolean" ? (
                  feature.premium ? (
                    <Check className="w-3 h-3 text-blue-600 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                ) : (
                  <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                    {feature.premium}
                  </span>
                )}
              </div>
              <div className="p-3 text-center border-l border-border bg-amber-50/50 dark:bg-amber-900/10">
                {typeof feature.gold === "boolean" ? (
                  feature.gold ? (
                    <Check className="w-3 h-3 text-amber-600 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                ) : (
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {feature.gold}
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
                    ? "border-[#2563EB] bg-[#2563EB]/5"
                    : "border-border hover:border-[#2563EB]/50"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-[#2563EB]" />
                  <span className="font-bold">Premium</span>
                </div>
                <p className="text-xs text-muted-foreground">Best for individuals</p>
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
                  <span className="font-bold">Gold</span>
                </div>
                <p className="text-xs text-muted-foreground">Ultimate experience</p>
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
                <p className="text-sm font-medium text-muted-foreground mb-1">Monthly</p>
                <p className="text-2xl font-bold">
                  ${pricing[selectedTier].monthly.price}
                </p>
                <p className="text-xs text-muted-foreground">per month</p>
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
                  {pricing[selectedTier].yearly.savings}
                </span>
                <p className="text-sm font-medium text-muted-foreground mb-1">Yearly</p>
                <p className="text-2xl font-bold">${pricing[selectedTier].yearly.price}</p>
                <p className="text-xs text-muted-foreground">
                  ${pricing[selectedTier].yearly.monthlyEquivalent.toFixed(2)}/month
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
                  : "bg-gradient-to-r from-[#2563EB] to-blue-400 hover:from-blue-400 hover:to-blue-500 text-blue-900"
              )}
              style={{
                boxShadow:
                  selectedTier === "gold"
                    ? "0 4px 20px rgba(251, 191, 36, 0.4)"
                    : "0 4px 20px rgba(37, 99, 235, 0.4)",
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {selectedTier === "gold" ? (
                    <Crown className="w-5 h-5" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  Upgrade to {selectedTier === "gold" ? "Gold" : "Premium"}
                </>
              )}
            </Button>
          </>
        )}

        {/* Add-on Store */}
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-4">Add-on Store</h3>
          <div className="grid grid-cols-2 gap-3">
            {ADD_ONS.map((addOn) => (
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
                      addOn.id === "vet_media" && "bg-blue-100 dark:bg-blue-900/20",
                      addOn.id === "family_slot" && "bg-green-100 dark:bg-green-900/20",
                      addOn.id === "verified_badge" && "bg-purple-100 dark:bg-purple-900/20"
                    )}
                  >
                    <addOn.icon className="w-5 h-5" />
                  </div>
                  {addOn.quantity && (
                    <span className="text-xs font-bold text-primary">×{addOn.quantity}</span>
                  )}
                </div>
                <h4 className="font-semibold text-sm mb-1">{addOn.name}</h4>
                <p className="text-xs text-muted-foreground mb-3">{addOn.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">${addOn.price}</span>
                  <Button
                    onClick={() => handleBuyAddOn(addOn)}
                    disabled={isProcessing}
                    size="sm"
                    variant="outline"
                  >
                    Buy
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <span className="text-xs text-muted-foreground">
            Secure payments powered by Stripe
          </span>
        </div>
      </div>
    </div>
  );
};

export default Premium;
