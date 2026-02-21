// BlurOverlayGate — Gating blur overlay with upsell (DESIGN_MASTER_SPEC §I, MASTER_SPEC §2.5)
// Wraps locked content with blur + glass overlay + CTA to subscription page
// Rules:
//   - No numeric limits exposed
//   - "Not now" always present
//   - Routes to Plus or Gold tab
//   - Calm, confident copy (no shaming)

import { useNavigate } from "react-router-dom";
import { plusTabRoute } from "@/lib/routes";
import { motion } from "framer-motion";
import { Lock, Diamond, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlurOverlayGateProps {
  locked: boolean;
  requiredTier: "plus" | "gold";
  /** Short headline ≤8 words */
  title?: string;
  /** Supportive line ≤14 words */
  body?: string;
  /** CTA label — defaults to "Unlock Plus" or "Unlock Gold" */
  ctaLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export const BlurOverlayGate = ({
  locked,
  requiredTier,
  title,
  body,
  ctaLabel,
  children,
  className,
}: BlurOverlayGateProps) => {
  const navigate = useNavigate();

  const isPlus = requiredTier === "plus";
  const defaultTitle = isPlus ? "Plus feature" : "Gold feature";
  const defaultBody = isPlus ? "Available with a Plus membership." : "Available with a Gold membership.";
  const defaultCta = isPlus ? "Unlock Plus" : "Unlock Gold";

  const handleCta = () => {
    navigate(plusTabRoute(isPlus ? "Plus" : "Gold"));
  };

  if (!locked) return <>{children}</>;

  return (
    <div className={cn("relative", className)}>
      {/* Blurred content — aria-hidden when locked */}
      <div
        className="pointer-events-none select-none blur-[8px] opacity-60"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 flex flex-col items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.85) 100%)" }}
      >
        {/* Lock icon with tier color */}
        <div className={cn(
          "neu-icon mb-3",
          isPlus ? "text-brandBlue" : "text-brandGold",
        )}>
          <Lock className="w-5 h-5" strokeWidth={1.75} />
        </div>

        {/* Tier badge */}
        <div className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-helper font-semibold mb-2",
          isPlus ? "bg-brandBlue/10 text-brandBlue" : "bg-brandGold/20 text-brandGold",
        )}>
          {isPlus ? (
            <Diamond className="w-3 h-3" strokeWidth={1.75} />
          ) : (
            <Star className="w-3 h-3" strokeWidth={1.75} />
          )}
          {isPlus ? "Plus" : "Gold"}
        </div>

        {/* Copy (calm, no shame) */}
        <p className="text-h3 font-semibold text-brandText text-center mb-1">
          {title || defaultTitle}
        </p>
        <p className="text-sub text-brandSubtext text-center mb-4 max-w-[220px]">
          {body || defaultBody}
        </p>

        {/* CTA */}
        <button
          onClick={handleCta}
          className={cn(
            "h-10 min-h-[44px] px-6 rounded-btn text-base font-semibold",
            isPlus ? "neu-primary" : "neu-gold",
          )}
        >
          {ctaLabel || defaultCta}
        </button>

        {/* Not now — always present (spec §I) */}
        <button
          onClick={() => {/* dismiss — parent controls locked state */}}
          className="mt-2 text-sub text-brandSubtext/70 hover:text-brandSubtext transition-colors min-h-[44px] px-4"
        >
          Not now
        </button>
      </motion.div>
    </div>
  );
};
