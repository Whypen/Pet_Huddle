/**
 * EmptyStateCard — UI CONTRACT v6.1 § Section 7 Blueprint
 *
 * T7 template: icon + headline + body + optional CTA.
 * Uses glass-card E1 surface (no backdrop-blur on page body).
 *
 * Layout (centre-aligned column):
 *   Icon container (neu-icon, 64px)
 *   Headline (SF Pro / Urbanist 20px semibold)
 *   Body copy (14px, var(--text-secondary))
 *   [Optional] CTA row (NeuControl primary)
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { NeuControl, type NeuControlProps } from "./NeuControl";

export interface EmptyStateCTAProps
  extends Omit<NeuControlProps, "variant" | "size"> {
  label: string;
}

export interface EmptyStateCardProps {
  /** Lucide icon element (24px, strokeWidth 1.75). */
  icon: React.ReactNode;
  /** Main heading. */
  headline: string;
  /** Explanatory body copy. */
  body?: string;
  /** Optional primary CTA. */
  cta?: EmptyStateCTAProps;
  /** Optional secondary CTA (tertiary variant). */
  secondaryCta?: EmptyStateCTAProps;
  /** Additional wrapper classes. */
  className?: string;
}

const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  icon,
  headline,
  body,
  cta,
  secondaryCta,
  className,
}) => (
  <div
    className={cn(
      "glass-card rounded-[20px]",
      "flex flex-col items-center justify-center text-center",
      "px-6 py-10 gap-4",
      className,
    )}
  >
    {/* Icon container — neu-icon soft recessed ring */}
    <div
      className={cn(
        "h-[64px] w-[64px] rounded-full",
        "flex items-center justify-center",
        "bg-[rgba(255,255,255,0.72)]",
        "shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]",
        "text-[var(--text-secondary)]",
      )}
      aria-hidden
    >
      {icon}
    </div>

    {/* Headline */}
    <h2 className="text-[20px] font-semibold text-[var(--text-primary,#424965)] leading-snug max-w-[240px]">
      {headline}
    </h2>

    {/* Body */}
    {body && (
      <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[260px]">
        {body}
      </p>
    )}

    {/* CTAs */}
    {(cta || secondaryCta) && (
      <div className="flex flex-col gap-3 w-full max-w-[220px] mt-2">
        {cta && (
          <NeuControl variant="primary" size="md" fullWidth {...cta}>
            {cta.label}
          </NeuControl>
        )}
        {secondaryCta && (
          <NeuControl variant="tertiary" size="md" fullWidth {...secondaryCta}>
            {secondaryCta.label}
          </NeuControl>
        )}
      </div>
    )}
  </div>
);

EmptyStateCard.displayName = "EmptyStateCard";

export { EmptyStateCard };
