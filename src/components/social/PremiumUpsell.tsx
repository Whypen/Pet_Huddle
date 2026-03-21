/**
 * PremiumUpsell — thin wrapper around StarUpgradeSheet.
 * Handles its own billing toggle + Stripe checkout so callers stay simple.
 *
 * tier="plus"  (default) → blue Plus card
 * tier="gold"            → coral Gold card
 *
 * All 7 callers that pass no tier prop get Plus by default.
 * Gold-only locked features should pass tier="gold".
 */

import { useCallback, useState } from "react";
import { StarUpgradeSheet } from "@/components/monetization/StarUpgradeSheet";
import { quotaConfig, type QuotaBillingCycle } from "@/config/quotaConfig";
import { startStripeCheckout } from "@/lib/stripeCheckout";
import { toast } from "sonner";

interface PremiumUpsellProps {
  isOpen: boolean;
  onClose: () => void;
  tier?: "plus" | "gold";
}

export const PremiumUpsell = ({ isOpen, onClose, tier = "plus" }: PremiumUpsellProps) => {
  const [billing, setBilling] = useState<QuotaBillingCycle>("monthly");
  const [loading, setLoading] = useState(false);

  const handleUpgrade = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const plan = quotaConfig.stripePlans[tier][billing === "annual" ? "annual" : "monthly"];
      const url = await startStripeCheckout({
        mode: "subscription",
        type: `${tier}_${billing === "annual" ? "annual" : "monthly"}`,
        lookupKey: plan.lookupKey,
        priceId: plan.priceId,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: window.location.href,
      });
      window.location.assign(url);
    } catch {
      toast.error("Unable to start checkout right now.");
    } finally {
      setLoading(false);
    }
  }, [billing, loading, tier]);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  return (
    <StarUpgradeSheet
      isOpen={isOpen}
      tier={tier}
      billing={billing}
      loading={loading}
      onClose={handleClose}
      onBillingChange={setBilling}
      onUpgrade={handleUpgrade}
    />
  );
};
