// src/components/monetization/SharePerksModal.tsx
import { useEffect, useState } from "react";
import { Users2, Check } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { useAuth } from "@/contexts/AuthContext";
import { fetchLivePrices, FALLBACK_PRICES, getCachedLivePrices, resolvePricingHints, type LivePriceMap } from "@/lib/stripePrices";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const LIME = "#7CFF6B";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Owner's tier — used to show correct feature list */
  tier: string;
}

const FEATURES_BASE = [
  "Your filters access",
  "Broadcast range & duration",
  "More Discovery",
];
const FEATURES_GOLD = ["Video uploads", "Top Profile Visibility"];

export function SharePerksModal({ isOpen, onClose, tier }: Props) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pricingHints, setPricingHints] = useState<{ country?: string; currency?: string }>({});
  const cachedPrices = getCachedLivePrices({
    currency: (profile as { currency?: string | null } | null)?.currency ?? undefined,
  });
  const [livePrices, setLivePrices] = useState<LivePriceMap>(cachedPrices ?? FALLBACK_PRICES);
  const isGold = tier === "gold";
  const features = isGold ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      const hints = await resolvePricingHints({
        userId: profile?.id,
        profileCountry: profile?.location_country,
        profileCurrency: (profile as { currency?: string | null } | null)?.currency ?? null,
      });
      if (!active) return;
      setPricingHints(hints);
      const prices = await fetchLivePrices({
        country: hints.country,
        currency: hints.currency,
      });
      if (active) setLivePrices(prices);
    })();
    return () => { active = false; };
  }, [isOpen, profile?.id, profile?.location_country, (profile as { currency?: string | null } | null)?.currency]);

  async function handlePurchase() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            mode: "subscription",
            type: "sharePerks",
            successUrl: `${window.location.origin}/settings?addon_done=1`,
            cancelUrl: window.location.href,
            country: pricingHints.country,
            currency: pricingHints.currency,
          },
        }
      );
      if (error || !data?.url) throw error ?? new Error("No checkout URL");
      window.location.href = data.url;
    } catch {
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} hideClose maxWidth="max-w-sm" className="!p-0 overflow-hidden">
      {/* Header stripe */}
      <div
        className="flex items-center gap-2 px-5 py-4"
        style={{ background: BRAND_BLUE }}
      >
        <Users2 size={18} color="#fff" strokeWidth={1.75} />
        <span className="text-[15px] font-[600] text-white">Share Perks</span>
        <span className="ml-auto text-[13px] font-[500] text-white/80">
          <PriceDisplay n={livePrices.sharePerks} suffix="/mo" currency={livePrices.currencyCode} />
        </span>
      </div>

      {/* Body — no space-y so mt-* on children is not overridden */}
      <div className="px-5 pt-4 pb-5">
        <p className="text-[13px] text-[var(--text-secondary)]">
          Mirrors tier's access to exclusive features
        </p>
        <div className="mt-3 space-y-1.5">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <span
                className="flex items-center justify-center w-[18px] h-[18px] rounded-full flex-shrink-0"
                style={{ background: LIME }}
              >
                <Check size={10} strokeWidth={3} color="#fff" />
              </span>
              <span className="text-[13px] text-[var(--text-primary)]">{f}</span>
            </div>
          ))}
        </div>
        <button
          onClick={handlePurchase}
          disabled={loading}
          className="mt-7 w-full rounded-[12px] py-3 text-[14px] font-[600] text-white"
          style={{ background: BRAND_BLUE }}
        >
          {loading ? "Loading…" : "Purchase Member Slot"}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full text-center text-[12px] text-[var(--text-tertiary)] pt-1"
        >
          Maybe later
        </button>
      </div>
    </GlassModal>
  );
}
