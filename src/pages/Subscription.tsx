import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  Check,
  X,
  CreditCard,
  History,
  Sparkles,
} from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanFeature {
  name: string;
  free: boolean | string;
  premium: boolean | string;
}

const planFeatures: PlanFeature[] = [
  { name: "Badge Type", free: "Grey Badge", premium: "Gold Badge" },
  { name: "AI Chat", free: "Text Only", premium: "Photo/Audio AI" },
  { name: "Broadcast Range", free: "1 mile", premium: "5 miles" },
  { name: "Filters", free: "Single Filter", premium: "Multi-select" },
  { name: "Ghost Mode", free: false, premium: true },
  { name: "Featured Posting", free: false, premium: true },
  { name: "Priority Support", free: false, premium: true },
  { name: "Ad-free Experience", free: false, premium: true },
];

const Subscription = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");

  const isPremium = profile?.user_role === "premium";

  const pricing = {
    monthly: { price: 9.99, period: "month" },
    yearly: { price: 79.99, period: "year", savings: "33%" },
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{t("premium.title")}</h1>
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
            <h2 className="text-2xl font-bold text-white mb-1">{t("premium.title")}</h2>
            <p className="text-amber-100 text-sm">{t("premium.unlock")}</p>
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
                  Next billing: Feb 28, 2026
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plan Toggle */}
        {!isPremium && (
          <div className="flex bg-muted rounded-xl p-1 mb-6">
            <button
              onClick={() => setSelectedPlan("monthly")}
              className={cn(
                "flex-1 py-3 rounded-lg text-sm font-medium transition-all",
                selectedPlan === "monthly"
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedPlan("yearly")}
              className={cn(
                "flex-1 py-3 rounded-lg text-sm font-medium transition-all relative",
                selectedPlan === "yearly"
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full">
                Save {pricing.yearly.savings}
              </span>
            </button>
          </div>
        )}

        {/* Compare Plans Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
          <div className="grid grid-cols-3 bg-muted/50">
            <div className="p-3">
              <span className="text-sm font-medium text-muted-foreground">Feature</span>
            </div>
            <div className="p-3 text-center border-l border-border">
              <span className="text-sm font-medium">{t("premium.free_plan")}</span>
            </div>
            <div className="p-3 text-center border-l border-border bg-amber-50 dark:bg-amber-900/20">
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {t("premium.premium_plan")}
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
                  That's only ${(pricing.yearly.price / 12).toFixed(2)}/month!
                </p>
              )}
            </div>
            <Button className="w-full py-6 text-lg gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-900">
              <Sparkles className="w-5 h-5" />
              {t("premium.upgrade")}
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
            <span className="text-sm text-muted-foreground">•••• 4242</span>
          </button>

          <button className="flex items-center justify-between w-full p-4 bg-card rounded-xl border border-border hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Transaction History</span>
            </div>
          </button>

          {isPremium && (
            <button className="w-full p-4 text-center text-destructive font-medium rounded-xl border border-destructive/30 hover:bg-destructive/10 transition-colors">
              Cancel Subscription
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
