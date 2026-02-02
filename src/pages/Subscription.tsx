import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  X,
  CreditCard,
  History,
  Sparkles,
  Loader2,
  Apple,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PlanFeature {
  name: string;
  free: boolean | string;
  premium: boolean | string;
}

const planFeatures: PlanFeature[] = [
  { name: "Badge Type", free: "Grey Badge", premium: "Gold Badge" },
  { name: "All Chats", free: "Limited", premium: "All Access" },
  { name: "AI Chat", free: "Text Only", premium: "Photo/Audio AI" },
  { name: "Broadcast Range", free: "1 mile", premium: "5 miles" },
  { name: "Filters", free: "Single Filter", premium: "Multi-select" },
  { name: "Ghost Mode", free: false, premium: true },
  { name: "Notice Board Posting", free: false, premium: true },
  { name: "Priority Support", free: false, premium: true },
  { name: "Ad-free Experience", free: false, premium: true },
];

const paymentMethods = [
  { id: "apple", name: "Apple Pay", icon: Apple },
  { id: "card", name: "Credit Card", icon: CreditCard },
  { id: "paypal", name: "PayPal", icon: CreditCard },
];

const Subscription = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [selectedPayment, setSelectedPayment] = useState<string>("apple");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  const isPremium = profile?.user_role === "premium";

  // Updated pricing per requirements
  const pricing = {
    monthly: { price: 8.99, period: "month" },
    yearly: { price: 80, period: "year", monthlyEquivalent: 6.67, savings: "Save 26%" },
  };

  const handleUpgrade = async () => {
    if (!user) return;

    setIsProcessing(true);

    try {
      // MOCK PAYMENT FLOW - 2 second delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update user_role to premium in database
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          user_role: "premium",
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Create subscription record (mock)
      const subscriptionData = {
        user_id: user.id,
        plan_type: selectedPlan,
        amount: selectedPlan === "monthly" ? pricing.monthly.price : pricing.yearly.price,
        currency: "USD",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(
          Date.now() + (selectedPlan === "monthly" ? 30 : 365) * 24 * 60 * 60 * 1000
        ).toISOString(),
      };

      // Try to insert subscription record
      await supabase.from("subscriptions").insert(subscriptionData);

      // Create payment record
      await supabase.from("payments").insert({
        user_id: user.id,
        amount: selectedPlan === "monthly" ? pricing.monthly.price : pricing.yearly.price,
        currency: "USD",
        status: "completed",
        payment_method: selectedPayment,
        description: `Huddle Premium ${selectedPlan === "monthly" ? "Monthly" : "Yearly"} Subscription`,
      });

      await refreshProfile();
      toast.success("Welcome to Huddle Premium!");
    } catch (error: any) {
      console.error("Subscription error:", error);
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;

    setIsProcessing(true);

    try {
      // Mock cancellation - 1 second delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const { error } = await supabase
        .from("profiles")
        .update({
          user_role: "free",
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("Subscription cancelled. You'll retain premium until the end of your billing period.");
    } catch (error) {
      toast.error("Failed to cancel subscription");
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
        <h1 className="text-xl font-bold">Manage Subscription</h1>
      </header>

      <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -top-20 -right-20 w-40 h-40 bg-white/10 rounded-full"
            />
          </div>
          <div className="relative text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">huddle Premium</h2>
            <p className="text-amber-100 text-sm">Unlock all features</p>
          </div>
        </div>

        {/* Current Status */}
        {isPremium && (
          <div className="bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-900" />
              </div>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  You're a Premium Member!
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Next billing: {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plan Toggle - Only for non-premium */}
        {!isPremium && (
          <>
            {/* Pricing Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Monthly Card */}
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
                <p className="text-2xl font-bold">${pricing.monthly.price}</p>
                <p className="text-xs text-muted-foreground">per month</p>
              </button>

              {/* Yearly Card */}
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
                  {pricing.yearly.savings}
                </span>
                <p className="text-sm font-medium text-muted-foreground mb-1">Yearly</p>
                <p className="text-2xl font-bold">${pricing.yearly.price}</p>
                <p className="text-xs text-muted-foreground">
                  ${pricing.yearly.monthlyEquivalent.toFixed(2)}/month
                </p>
              </button>
            </div>

            {/* Payment Method Selector */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Payment Method</h3>
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                      selectedPayment === method.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <method.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{method.name}</span>
                    {selectedPayment === method.id && (
                      <Check className="w-4 h-4 text-primary ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Compare Plans Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="grid grid-cols-3 bg-muted/50">
            <div className="p-3">
              <span className="text-sm font-medium text-muted-foreground">Feature</span>
            </div>
            <div className="p-3 text-center border-l border-border">
              <span className="text-sm font-medium">Free</span>
            </div>
            <div className="p-3 text-center border-l border-border bg-amber-50 dark:bg-amber-900/20">
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Premium
              </span>
            </div>
          </div>

          {planFeatures.map((feature, i) => (
            <div
              key={feature.name}
              className={cn("grid grid-cols-3", i % 2 === 0 && "bg-muted/30")}
            >
              <div className="p-3 text-sm">{feature.name}</div>
              <div className="p-3 text-center border-l border-border">
                {typeof feature.free === "boolean" ? (
                  feature.free ? (
                    <Check className="w-4 h-4 text-accent mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground mx-auto" />
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">{feature.free}</span>
                )}
              </div>
              <div className="p-3 text-center border-l border-border bg-amber-50/50 dark:bg-amber-900/10">
                {typeof feature.premium === "boolean" ? (
                  feature.premium ? (
                    <Check className="w-4 h-4 text-amber-600 mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground mx-auto" />
                  )
                ) : (
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {feature.premium}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pricing CTA */}
        {!isPremium && (
          <div className="bg-card rounded-xl p-6 border border-border mb-6">
            <div className="text-center mb-4">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold">
                  ${selectedPlan === "monthly" ? pricing.monthly.price : pricing.yearly.price}
                </span>
                <span className="text-muted-foreground">
                  /{pricing[selectedPlan].period}
                </span>
              </div>
              {selectedPlan === "yearly" && (
                <p className="text-sm text-accent mt-1">
                  That's only ${pricing.yearly.monthlyEquivalent.toFixed(2)}/month!
                </p>
              )}
            </div>
            <Button
              onClick={handleUpgrade}
              disabled={isProcessing}
              className="w-full py-6 text-lg gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-900"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Upgrade to Premium
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              Cancel anytime. No commitments.
            </p>
          </div>
        )}

        {/* Billing Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Billing</h3>

          <button className="flex items-center justify-between w-full p-4 bg-card rounded-xl border border-border hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Payment Methods</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {isPremium ? "•••• 4242" : "None"}
            </span>
          </button>

          <button
            onClick={() => setShowTransactions(!showTransactions)}
            className="flex items-center justify-between w-full p-4 bg-card rounded-xl border border-border hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Transaction History</span>
            </div>
          </button>

          {/* Transaction History Expandable */}
          <AnimatePresence>
            {showTransactions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                  {isPremium ? (
                    <>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">Premium Subscription</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date().toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">$8.99 USD</p>
                          <p className="text-xs text-accent">Completed</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      No transactions yet
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isPremium && (
            <button
              onClick={handleCancel}
              disabled={isProcessing}
              className="w-full p-4 text-center text-destructive font-medium rounded-xl border border-destructive/30 hover:bg-destructive/10 transition-colors"
            >
              {isProcessing ? "Cancelling..." : "Cancel Subscription"}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <span className="text-xs text-muted-foreground">v1.0.0 (2026)</span>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
