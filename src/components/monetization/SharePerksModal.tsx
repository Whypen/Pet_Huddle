// src/components/monetization/SharePerksModal.tsx
import { useEffect, useMemo, useState } from "react";
import { Users2, Check } from "lucide-react";
import { useLocation } from "react-router-dom";
import { GlassModal } from "@/components/ui/GlassModal";
import { useAuth } from "@/contexts/AuthContext";
import { fetchLivePrices, FALLBACK_PRICES, getCachedLivePrices, getLastLivePricesSnapshot, resolvePricingHints, type LivePriceMap } from "@/lib/stripePrices";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
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
  const location = useLocation();
  const { profile } = useAuth();
  const profilePrefs = (profile?.prefs as Record<string, unknown> | null | undefined) ?? null;
  const savedPricingCurrency = typeof profilePrefs?.pricing_currency === "string"
    ? profilePrefs.pricing_currency
    : null;
  const [loading, setLoading] = useState(false);
  const [pricingHints, setPricingHints] = useState<{ country?: string; currency?: string }>({});
  const cachedPrices = getCachedLivePrices({
    currency: savedPricingCurrency ?? undefined,
  }) ?? getLastLivePricesSnapshot();
  const [livePrices, setLivePrices] = useState<LivePriceMap>(cachedPrices ?? FALLBACK_PRICES);
  const isGold = tier === "gold";
  const features = isGold ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;
  const normalizedTier = String(profile?.effective_tier || profile?.tier || tier || "free").toLowerCase();
  const baseFamilySlots = normalizedTier === "plus" || normalizedTier === "gold" ? 2 : 1;
  const purchasedFamilySlots = Math.max(0, Number(profile?.family_slots || 0));
  const totalFamilyCapacity = Math.min(4, baseFamilySlots + purchasedFamilySlots);
  const isMaxFamilyCapacity = totalFamilyCapacity >= 4;
  const isSharePerksRecurring = livePrices.sharePerksInterval === "month" || livePrices.sharePerksInterval === "year";
  const sharePerksSuffix = livePrices.sharePerksInterval === "year" ? "/yr" : "/mo";
  const isSharePerksPurchasable = isSharePerksRecurring && Number.isFinite(livePrices.sharePerks) && livePrices.sharePerks > 0 && !isMaxFamilyCapacity;
  const returnTo = useMemo(() => {
    const target = `${location.pathname}${location.search}`;
    return target.startsWith("/") ? target : "/";
  }, [location.pathname, location.search]);
  const encodedReturnTo = encodeURIComponent(returnTo);
  const successUrl = `${window.location.origin}/premium?addon_done=1&return_to=${encodedReturnTo}&reopen_drawer=1`;
  const cancelUrl = `${window.location.origin}/premium?tab=addons&return_to=${encodedReturnTo}&reopen_drawer=1`;

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      const hints = await resolvePricingHints({
        userId: profile?.id,
        profileCountry: profile?.location_country,
        profileCurrency: savedPricingCurrency,
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
  }, [isOpen, profile?.id, profile?.location_country, savedPricingCurrency]);

  async function handlePurchase() {
    if (!isSharePerksPurchasable) {
      toast.error(isMaxFamilyCapacity ? "Max. capacity reached" : "Share Perks is temporarily unavailable. Please try again shortly.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await invokeAuthedFunction<{ url?: string }>("create-checkout-session", {
        body: {
          userId: profile?.id,
          mode: "subscription",
          type: "family_member",
          successUrl,
          cancelUrl,
          country: pricingHints.country,
          currency: pricingHints.currency,
        },
      });
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
          {isSharePerksPurchasable ? (
            <PriceDisplay
              n={livePrices.sharePerks}
              suffix={sharePerksSuffix}
              currency={livePrices.currencyCode}
            />
          ) : (
            isMaxFamilyCapacity ? "Max. capacity reached" : "Unavailable"
          )}
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
          disabled={loading || !isSharePerksPurchasable}
          className="mt-7 w-full rounded-[12px] py-3 text-[14px] font-[600] text-white"
          style={{
            background: BRAND_BLUE,
            opacity: loading || !isSharePerksPurchasable ? 0.55 : 1,
          }}
        >
          {loading ? "Loading…" : isSharePerksPurchasable ? "Purchase Member Slot" : (isMaxFamilyCapacity ? "Max. capacity reached" : "Temporarily unavailable")}
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
