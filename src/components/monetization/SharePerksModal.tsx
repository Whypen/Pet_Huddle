// src/components/monetization/SharePerksModal.tsx
import { useState } from "react";
import { Users2, Check } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { fmtCurrency } from "@/lib/stripePrices";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BRAND_BLUE = "#2145CF";
const LIME = "#7CFF6B";
const SHARE_PERKS_PRICE = 4.99;

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
  const [loading, setLoading] = useState(false);
  const isGold = tier === "gold";
  const features = isGold ? [...FEATURES_BASE, ...FEATURES_GOLD] : FEATURES_BASE;

  async function handlePurchase() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            mode: "subscription",
            type: "sharePerks",
            priceId: "price_1SwQsp5QcAjQDse0RaD0z8nh",
            lookupKey: "Family_Member",
            successUrl: `${window.location.origin}/settings?addon_done=1`,
            cancelUrl: window.location.href,
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
          {fmtCurrency(SHARE_PERKS_PRICE)}/mo
        </span>
      </div>

      {/* Body */}
      <div className="px-5 pt-4 pb-5 space-y-2">
        <p className="text-[13px] text-[var(--text-secondary)]">
          Mirrors tier's access to exclusive features
        </p>
        <div className="space-y-1.5 pt-1">
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
          className="w-full text-center text-[12px] text-[var(--text-tertiary)] pt-1"
        >
          Maybe later
        </button>
      </div>
    </GlassModal>
  );
}
